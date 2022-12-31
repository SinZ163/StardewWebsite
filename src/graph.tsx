import { Log, LogLevel } from "./logParser";
import { Group } from "@visx/group";
import { scaleLinear, scaleOrdinal, scaleTime } from "@visx/scale";
import { Bar } from "@visx/shape";
import React, { PropsWithChildren, useMemo, useState } from "react";
import { interpolateWarm } from "d3-scale-chromatic";
import { Brush } from "@visx/brush";
import { Bounds } from "@visx/brush/lib/types";
import { AxisBottom, AxisLeft } from "@visx/axis";
import withTooltip, { WithTooltipProvidedProps } from "@visx/tooltip/lib/enhancers/withTooltip";
import { TooltipWithBounds } from "@visx/tooltip";

interface LogMsg {
    OccuredAt: number,
    Metadata: EventInfo
}

interface BaseEvent {
    ModId: string,
    EventType: string,
    Details: string,
    InnerDetails: LogMsg[],
}
interface DurationEvent extends BaseEvent {
    Duration: number
}
type EventInfo = BaseEvent | DurationEvent;

const getOccuredAt = (d: LogMsg) => d.OccuredAt;
const getDuration = (d: LogMsg) => (d.Metadata as DurationEvent).Duration;

interface InnerGraphProps extends PropsWithChildren {
    showAxis: boolean,
    data: LogMsg[],
    height: number
    width: number,
    margin: {
        top: number,
        left: number,
        right: number,
        bottom: number
    },
    top?: number,
    colorScale: ReturnType<typeof scaleOrdinal<string, string>>,
    showTooltip?: (args: {tooltipData: LogMsg, tooltipTop: number, tooltipLeft: number}) => void,
    hideTooltip?: () => void,
}

let tooltipTimeout: number|null;

// Based off https://stackoverflow.com/a/58826445 with added millisecond support
function timeConversion(duration: number) {
    const portions: string[] = [];
  
    const msInHour = 1000 * 60 * 60;
    const hours = Math.trunc(duration / msInHour);
    if (hours > 0) {
      portions.push(hours + 'h');
      duration = duration - (hours * msInHour);
    }
  
    const msInMinute = 1000 * 60;
    const minutes = Math.trunc(duration / msInMinute);
    if (minutes > 0) {
      portions.push(minutes + 'm');
      duration = duration - (minutes * msInMinute);
    }
  
    const seconds = Math.trunc(duration / 1000);
    if (seconds > 0) {
      portions.push(seconds + 's');
      duration = duration - (seconds * 1000);
    }
  
    const milliseconds = Math.trunc(duration);
    if (milliseconds > 0) {
      portions.push(milliseconds + 'ms');
    }
  
    return portions.join(' ');
  }

const InnerGraph = ({showAxis, data, height, width, children, margin, top, colorScale, showTooltip, hideTooltip}: InnerGraphProps) => {
    if (data.length == 0) return null;
    const getColor = (d: LogMsg) => colorScale(d.Metadata.ModId);

    const xScale = scaleLinear({
        domain: [getOccuredAt(data[0]), getOccuredAt(data[data.length - 1])],
        range: [0, width - margin.left - margin.right]
    });

    const innerHeight = height - margin.top - margin.bottom;

    const maxDuration = data.reduce((prev, current) => (current.Metadata as DurationEvent).Duration > prev ? (current.Metadata as DurationEvent).Duration : prev, 0);
    //const maxDuration = 150000

    const yScale = scaleLinear({
        domain: [0, maxDuration],
        range: [innerHeight, 0],
        nice: true,
    })

    return <>
        <Group left={margin.left} top={top ?? margin.top}>
            {data.map((row, i) => {
                const duration = yScale(getDuration(row));
                const barHeight = innerHeight - duration;
                const barX = xScale(getOccuredAt(row));
                const barY = innerHeight - barHeight;
                return <Bar
                    key={i}
                    x={barX}
                    y={barY}
                    width={3}
                    height={barHeight}
                    fill={getColor(row)}
                    onMouseMove={showTooltip && (() => {
                        if (tooltipTimeout) {
                            clearTimeout(tooltipTimeout);
                            tooltipTimeout = null;
                        }
                        showTooltip({
                            tooltipData: row,
                            tooltipTop: barY,
                            tooltipLeft: barX
                        })
                    })}
                    onMouseLeave={hideTooltip && (() => {
                        tooltipTimeout = window.setTimeout(() => hideTooltip(), 300);
                    })}
                />
            })}
            {showAxis && <>
                <AxisLeft
                    scale={yScale}
                    tickFormat={(v => timeConversion(v as number))}
                />
                <AxisBottom
                    scale={xScale}
                    top={innerHeight}
                    tickFormat={(v => timeConversion(v as number))}
                />
            </>}
            {children}
        </Group>
    </>
}

type LogFilter = (data: LogMsg) => boolean;

const percentFormatter = new Intl.NumberFormat("default", {style: "percent", maximumFractionDigits: 2});
const Tooltip = ({log, parentDuration}: {log: LogMsg, parentDuration?: number}) => {
    // TODO: When non duration events show up, we really need a way to make it a discriminated union
    let eventInfo = log.Metadata as DurationEvent;

    let parentTime = parentDuration ? parentDuration : eventInfo.Duration;

    let innerEvents = eventInfo.InnerDetails.concat()
        .sort((a,b) => (b.Metadata as DurationEvent).Duration - (a.Metadata as DurationEvent).Duration);
    let extra: JSX.Element|null = null;
    if (innerEvents.length > 30) {
        let extraEvents = innerEvents.splice(30, innerEvents.length - 30);
        let extraDuration = extraEvents.reduce((prev, current) => prev + (current.Metadata as DurationEvent).Duration, 0);
        extra = <li>.. And {extraEvents.length} more - {timeConversion(extraDuration)} ({percentFormatter.format(extraDuration / parentTime)})</li>;
    }

    return (
        <div>
            <div>
                {eventInfo.ModId} ({eventInfo.EventType} {eventInfo.Details})
                 - {timeConversion(eventInfo.Duration)}
                 {parentDuration && ` (${percentFormatter.format(eventInfo.Duration / parentDuration)})`}
            </div>
            <ol>
                {innerEvents
                    .map(e => <li><Tooltip log={e} parentDuration={parentTime}/></li>)}
                {extra}
            </ol>
        </div>
    );
}

const Graph = withTooltip<{log: Log}, LogMsg>(({log, tooltipOpen, tooltipData, tooltipTop, tooltipLeft, showTooltip, hideTooltip}: {log: Log} & WithTooltipProvidedProps<LogMsg>) => {
    const [dataset, setDataSet] = useState<LogMsg[]>([]);
    useMemo(() => {
        const data = log.messages
        .filter(message => 
            message.ModName === "Profiler" && 
            message.LogLevel == LogLevel.TRACE && 
            message.text[0].startsWith("[RawLog] ")
        )
        .map(row => row.text.join("\n").substring("[RawLog] ".length))
        .map(row => JSON.parse(row) as LogMsg);
        setDataSet(data);
    }, [log.messages.length]);
    const [filter, setFilter] = useState<LogFilter|null>(null);
    
    const keys = dataset.map(row => row.Metadata.ModId).filter((row, i, arr) => arr.indexOf(row) === i);
    let colors: string[] = [];
    if (keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
            colors.push(interpolateWarm(i / keys.length));
        }
    }
    const colorScale = scaleOrdinal({
        domain: keys,
        range: colors,
    });

    let chartData = dataset;
    if (filter) {
        chartData = chartData.filter(filter);
    }

    const margin = {
        top: 20,
        left: 80,
        right: 30, // right margin is toaccount for the last event having width to it
        bottom: 20
    }
    
    if (dataset.length == 0) {
        return <div />;
    }
    const brushXScale = scaleLinear({
        range: [0, window.innerWidth - margin.left - margin.right],
        domain: [getOccuredAt(dataset[0]), getOccuredAt(dataset[dataset.length - 1])],
    })
    const brushYScale = scaleLinear({
        domain: [0, 100],
        range: [0, 1]
    });

    const onBrushChange = (domain: Bounds|null) => {
        if (!domain) return;
        const {x0, x1} = domain;
        console.log(x0, x1, x0 - margin.left, x1 - margin.left);
        setFilter(() => (data => {
            return getOccuredAt(data) >= x0 && getOccuredAt(data) <= x1})
        );
    }

    return <div>
        <svg width={window.innerWidth} height={750}>
            <InnerGraph data={chartData} showAxis height={500} width={window.innerWidth} margin={margin} colorScale={colorScale} showTooltip={showTooltip} hideTooltip={hideTooltip} />
            <InnerGraph data={dataset} showAxis height={200} width={window.innerWidth} margin={margin} top={550} colorScale={colorScale}>
                <Brush
                    xScale={brushXScale}
                    yScale={brushYScale}
                    margin={{left: margin.left, right: margin.right}}
                    width={window.innerWidth - margin.left - margin.right}
                    height={200 - margin.top - margin.bottom}
                    resizeTriggerAreas={['left', 'right']}
                    brushDirection="horizontal"
                    handleSize={8}
                    onChange={onBrushChange}
                    onClick={() => setFilter(null)}
                    useWindowMoveEvents
                />
            </InnerGraph>
        </svg>
        {tooltipOpen && tooltipData && (
            <TooltipWithBounds top={tooltipTop} left={(tooltipLeft ?? 0) + 50}>
                <Tooltip log={tooltipData} />
            </TooltipWithBounds>
        )}
    </div>
});
export default Graph;