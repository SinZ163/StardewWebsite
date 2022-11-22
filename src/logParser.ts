import { makeAutoObservable, runInAction } from "mobx";

interface RawMessage {
    groups: {
        level: string,
        modName: string,
        screen: string|undefined,
        time: string
    }
    0: string
}
export enum LogLevel {
    TRACE,
    DEBUG,
    INFO,
    WARN,
    ERROR,
    ALERT,
}
export interface Message {
    LogLevel: LogLevel,
    LogTime: Date,
    ScreenID: number,
    ModName: string,
    text: string[]
}

export class Log {
    filename: string;
    filepath: string;
    modlist: Map<string, Mod> = new Map();
    contentPackList: Map<string, ContentPack> = new Map();
    messages: Message[] = [];
    constructor(filename: string, filepath: string) {
        this.filename = filename;
        this.filepath = filepath;
        makeAutoObservable(this);
    }
}

interface RawModListEntry {
    groups: Mod
}
interface Mod {
    name: string,
    version: string,
    author: string,
    description: string
}
interface RawContentListEntry {
    groups: ContentPack;
}
interface ContentPack {
    name: string;
    version: string;
    author: string;
    baseMod: string;
    description: string;
}
const messageHeaderPattern = /^\[(?<time>\d\d[:\.]\d\d[:\.]\d\d) (?<level>[a-z]+)(?: +screen_(?<screen>\d+))? +(?<modName>[^\]]+)\]/i;
const modListStartPattern = /^Loaded \d+ mods:$/i;
const modlistEntryPattern = /^   (?<name>.+?) (?<version>[^\s]+)(?: by (?<author>[^\|]+))?(?: \| (?<description>.+))?$/i;
const contentPackListStartPattern = /^Loaded \d+ content packs:$/i;
const contentPackListEntryPattern = /^   (?<name>.+?) (?<version>[^\s]+)(?: by (?<author>[^\|]+))? \| for (?<for>[^\|]*)(?: \| (?<description>.+))?$/i;

const startLogsPattern = /^Launching mods\.\.\.$/i;

enum ParserState {
    Uninitialized,
    Initialized,
    ModList,
    ContentList,
    Messages
}

export default class LogParser {
    private log: Log;
    private file: File;

    private pendingMessages: Message[] = [];

    private parserState: ParserState = ParserState.Uninitialized;

    public initializeLog(file: File): Log {
        this.file = file;
        this.log = new Log(
            file.name,
            file.webkitRelativePath
        );
        this.parserState = ParserState.Initialized;
        return this.log;
    }   

    private processMessage(msg: Message) {
        if (msg.ModName === "SMAPI") {
            switch (this.parserState) {
                case ParserState.Initialized:
                    if (modListStartPattern.test(msg.text[0])) {
                        this.parserState = ParserState.ModList;
                    }
                    break;
                case ParserState.ModList:
                    let modlistEntry = modlistEntryPattern.exec(msg.text.join("\n")) as unknown as RawModListEntry|null;
                    if (modlistEntry) {
                        this.log.modlist.set(modlistEntry.groups.name, modlistEntry.groups);
                    }
                    else if (contentPackListStartPattern.test(msg.text[0])) {
                        this.parserState = ParserState.ContentList;
                    }
                    break;
                case ParserState.ContentList:
                    let contentEntry = contentPackListEntryPattern.exec(msg.text.join("\n")) as unknown as RawContentListEntry|null;
                    if (contentEntry) {
                        this.log.contentPackList.set(contentEntry.groups.name, contentEntry.groups);
                    } else if (startLogsPattern.test(msg.text[0])) {
                        this.parserState = ParserState.Messages;
                    }
                    break;
            }
        }
        this.pendingMessages.push(msg);
        if (this.pendingMessages.length > 50_000) {
            runInAction(() => {
                this.log.messages = this.log.messages.concat(this.pendingMessages);
            })
            this.pendingMessages = [];
        }
    }

    private readLogLine(line: string, currentMessage: Message | undefined, firstLine: boolean) {
        let output = messageHeaderPattern.exec(line) as unknown as RawMessage;
        let isNewMessage = output !== null;
        if (isNewMessage) {
            if (currentMessage) {
                this.processMessage(currentMessage);
            }
            let date = new Date(0);
            date.setHours(...output.groups.time.split(":").map(seg => parseInt(seg)) as [number, number, number]);
            currentMessage = {
                LogLevel: LogLevel[output.groups.level],
                LogTime: date,
                ScreenID: output.groups.screen ? parseInt(output.groups.screen) : 0,
                ModName: output.groups.modName,
                text: [line.substring(output[0].length + 1)],
            };
        } else if (currentMessage) {
            if (firstLine) {
                currentMessage.text[currentMessage.text.length - 1] += line;
                if (messageHeaderPattern.test(currentMessage.text[currentMessage.text.length - 1])) {
                    let lastMessage = currentMessage.text.pop()!;
                    currentMessage = this.readLogLine(lastMessage, currentMessage, true);
                }
            } else {
                currentMessage.text.push(line);
            }
        } else {
            throw new Error("Not a SMAPI Log");
        }
        return currentMessage;
    }

    public async parseLog() {
        const fileStream = this.file.stream();
        const reader = fileStream.pipeThrough(new TextDecoderStream()).getReader();
        let currentMessage: Message|undefined = undefined;
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            let lines = value.split("\n").map(row => row.trimEnd());
            let firstLine = true;
            for (let line of lines) {
                currentMessage = this.readLogLine(line, currentMessage, firstLine);
                firstLine = false;
            }
        }
        runInAction(() => {
            this.log.messages = this.log.messages.concat(this.pendingMessages);
            this.pendingMessages = [];
        })
    }
}