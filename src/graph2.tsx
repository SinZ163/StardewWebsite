import { Log, LogLevel } from "./logParser";
import { AxisLeft, AxisTop } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { TooltipWithBounds } from "@visx/tooltip";
import withTooltip, { WithTooltipProvidedProps } from "@visx/tooltip/lib/enhancers/withTooltip";
import React, { useMemo, useState } from "react";

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

const Graph2 = withTooltip<{log: Log}, LogMsg>(({log, tooltipOpen, tooltipData, tooltipTop, tooltipLeft, showTooltip, hideTooltip}: {log: Log} & WithTooltipProvidedProps<LogMsg>) => {
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
    if (dataset.length == 0) {
        return <div />;
    }
    console.log("Starting Graph2");
    console.time("Graph2");
    
    const width = window.innerWidth - 100;
    const margin = {
        top: 20,
        left: 50,
        right: 0,
        bottom: 20
    }
    const data = dataset;
    const xScale = scaleLinear({
        domain: [getOccuredAt(data[0]), getOccuredAt(data[data.length - 1])],
        range: [0, width - margin.left - margin.right]
    });
    const yScale = scaleLinear({
        domain: [0, 100],
        range: [0, 900],
    })

    interface InnerGraphProps {
        row: LogMsg,
        depth?: number,
        showTooltip: (args: {tooltipData: LogMsg, tooltipTop: number, tooltipLeft: number}) => void,
        hideTooltip: () => void,
    }
    const RenderLogRow = function({row, depth=0, showTooltip, hideTooltip}: InnerGraphProps) {
        const x = xScale(row.OccuredAt);
        let width = 0;
        const durationRow = row.Metadata as DurationEvent;
        if (durationRow.Duration < 10) {
            return null;
        }
        const x2 = xScale(row.OccuredAt + (durationRow.Duration ?? 0));
        width = x2 - x;
        return <>
            <Bar
                key={row.OccuredAt}
                x={x}
                width={width}
                y={100 * depth}
                height={100}
                onMouseMove={(() => {
                    showTooltip({
                        tooltipData: row,
                        tooltipTop: 100 * depth,
                        tooltipLeft: x
                    })
                })}
                onMouseLeave={() => {
                    console.log("Hiding tooltip?"); hideTooltip();
                }}
            />
            {row.Metadata.InnerDetails.map((innerRow, innerI) => <RenderLogRow key={innerI} row={innerRow} depth={depth + 1} showTooltip={showTooltip} hideTooltip={hideTooltip} />)}
        </>
    };
    

    const response = <div>
        <svg width={width} height={1000}>
            {data.map((row, i) => <RenderLogRow key={i} row={row} showTooltip={showTooltip} hideTooltip={hideTooltip} />)}
            <AxisLeft
                scale={yScale}
                tickFormat={(v => v.toString())}
            />
            <AxisTop
                scale={xScale}
            />
        </svg>
        {tooltipOpen && tooltipData && (
            <TooltipWithBounds top={tooltipTop} left={(tooltipLeft ?? 0) + 50}>
                <pre>{JSON.stringify(tooltipData, undefined, 4)}</pre>
            </TooltipWithBounds>
        )}
    </div>;
    console.log("Finished graph2");
    console.timeEnd("Graph2");
    return response;
});
export default Graph2;