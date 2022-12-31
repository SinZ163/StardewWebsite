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
                    tickFormat={(v => v.toString())}
                />
                <AxisBottom
                    scale={xScale}
                    top={innerHeight}
                />
            </>}
            {children}
        </Group>
    </>
}

type LogFilter = (data: LogMsg) => boolean;

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
        left: 50,
        right: 0,
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
                <pre>{JSON.stringify(tooltipData, undefined, 4)}</pre>
            </TooltipWithBounds>
        )}
    </div>
});
export default Graph;