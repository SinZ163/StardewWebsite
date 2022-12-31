import React, { DragEvent } from "react";
import styled from "styled-components";
import { makeAutoObservable, action } from "mobx";
import { observer } from "mobx-react-lite";
import { Box, Grommet, grommet, Heading, FileInput, InfiniteScroll, Tabs, Tab, Text, Paragraph, Button } from "grommet";
import Graph from "./graph";
import Graph2 from "./graph2";
import LogParser, { Log, LogLevel, Message } from "./logParser";
import { ErrorBoundary } from "react-error-boundary";

class LogStore {
    logs: Log[] = [];

    constructor() {
        makeAutoObservable(this);
    }

    readFile = async (file: File) => {
        console.log("Reading file");
        const logParser = new LogParser();
        const log = logParser.initializeLog(file);
        this.logs.push(log);
        await logParser.parseLog();
        
        console.log(log);
    }
}
const logStore = new LogStore();
(window as any).profilerLogStore = logStore;

const onDrop: React.DragEventHandler<HTMLElement> = (e: DragEvent<HTMLElement>) => {
    console.log("hello world");
    e.preventDefault();
    for (let file of e.dataTransfer.files) {
        logStore.readFile(file);
    }
}

const logLevelToColor = (logLevel: LogLevel) => {
    switch (logLevel) {
        case LogLevel.ERROR:
            return "status-error";
        case LogLevel.WARN:
            return "status-warning";
        case LogLevel.ALERT:
            return "brand";
        case LogLevel.DEBUG:
        case LogLevel.TRACE:
            return "status-disabled";
    }
}

const hasProfiler2 = (log: Log) => log.modlist.has("Profiler") && !log.modlist.get("Profiler")?.version.startsWith("1")

const LogEntry = observer(({log}: {log: Log}) => <Tabs>
    <Tab title="Log Viewer">
        <table>
            <tbody>
                <InfiniteScroll items={log.messages} step={200} replace renderMarker={marker => <tr><td>{marker}</td></tr>}>
                    {(msg: Message, i: number) => {
                        const textColor = logLevelToColor(msg.LogLevel);
                        return <tr key={i}>
                            <td> 
                                <Text color={textColor}>{msg.ModName}</Text>
                            </td>
                            <td>
                                {msg.text.map((line, j) => <Text key={j} color={textColor}>{line}</Text>)}
                            </td>
                        </tr>
                        }
                    }
                </InfiniteScroll>
            </tbody>
        </table>
    </Tab>
    <Tab title="Log Graphs (Coming soon)" disabled>
        <Text>Come back soon</Text>
    </Tab>
    <Tab title="Profiler Analysis (Column Chart)" disabled={!hasProfiler2(log)}>
        <Graph log={log} />
    </Tab>
    <Tab title="Profiler Analysis (Alternative Experimental)" disabled={!hasProfiler2(log)}>
        <Graph2 log={log} />
    </Tab>
</Tabs>);

const LogViewer = observer(() => {
    if (logStore.logs.length == 0) return null;
    return <Tabs justify="start">
        {logStore.logs.map((log, i) => <Tab key={i} title={log.filename}><LogEntry log={log} /></Tab>)}
    </Tabs>;
});
const TopBar = observer(() => {
    return <Box direction="row">
        <Heading>Welcome to Profiler Log Analysis</Heading>
        <FileInput multiple onChange={e => {
            if (!e) return;
            for (let file of e.target.files ?? []) {
                logStore.readFile(file);
            }
        }} />
    </Box>;
});

const FallbackComponent = ({error, resetErrorBoundary}) => <Box>
    <Paragraph>Something went wrong!</Paragraph>
    <pre>{error.message}</pre>
    <Button onClick={resetErrorBoundary}>Try again?</Button>
</Box>;

const App = () => <Grommet full={true} theme={grommet} onDrop={action(onDrop)} onDragOver={e => e.preventDefault()}>
    <ErrorBoundary FallbackComponent={FallbackComponent}>
        <TopBar />
        <LogViewer />
    </ErrorBoundary>
</Grommet>;
export default App;