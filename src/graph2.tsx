import { Log, LogLevel } from "./logParser";
import { AxisLeft, AxisTop } from "@visx/axis";
import { Group } from "@visx/group";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { Bar } from "@visx/shape";
import { TooltipWithBounds } from "@visx/tooltip";
import withTooltip, { WithTooltipProvidedProps } from "@visx/tooltip/lib/enhancers/withTooltip";
import React, { useMemo, useState } from "react";
import { timeConversion } from "./graph";


interface LogMsg {
    OccuredAt: number,
    Metadata: EventInfo
}

interface BaseEvent {
    ModId: string,
    EventType: string,
    Details: string,
    InnerDetails: LogMsg[],
    Type: string,
}
interface DurationEvent extends BaseEvent {
    Duration: number,
    Type: "Duration"
}
interface TraceEvent extends BaseEvent {
    Type: "Trace"
}
type EventInfo = DurationEvent | TraceEvent;


const getOccuredAt = (d: LogMsg) => d.OccuredAt;

const Graph2 = withTooltip<{dataset: LogMsg[], colorScale: ReturnType<typeof scaleOrdinal<string, string>>}, string>(({dataset, colorScale, tooltipOpen, tooltipData, tooltipTop, tooltipLeft, showTooltip, hideTooltip}: {dataset: LogMsg[], colorScale: ReturnType<typeof scaleOrdinal<string, string>>,} & WithTooltipProvidedProps<string>) => {
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
    let lastLogMsg = data[data.length - 1];
    let lastMsg = lastLogMsg.OccuredAt;
    if (lastLogMsg.Metadata.Type === "Duration") {
        lastMsg += lastLogMsg.Metadata.Duration;
    }
    const xScale = scaleLinear({
        domain: [getOccuredAt(data[0]), lastMsg],
        range: [0, width - margin.left - margin.right]
    });

    interface InnerGraphProps {
        row: LogMsg,
        depth?: number,
        showTooltip: (args: {tooltipData: string, tooltipTop: number, tooltipLeft: number}) => void,
        hideTooltip: () => void,
    }
    const RenderLogRow = function({row, depth=0, showTooltip, hideTooltip}: InnerGraphProps) {
        const x = xScale(row.OccuredAt);
        let width = 0;
        const durationRow = row.Metadata as DurationEvent;
        const x2 = xScale(row.OccuredAt + (durationRow.Duration ?? 0));
        width = x2 - x;
        
        const getColor = (d: LogMsg) => colorScale(d.Metadata.ModId);
        return <>
            <Bar
                key={row.OccuredAt}
                x={x}
                width={width}
                y={75 * depth}
                height={75}
                fill={getColor(row)}
                stroke="#000"
                onMouseMove={(() => {
                    showTooltip({
                        tooltipData: row.Metadata.ModId + ", " + row.Metadata.EventType + " (" + row.Metadata.Details + "), " + timeConversion(durationRow.Duration),
                        tooltipTop: 75 * depth,
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
        <svg width={width} height={600}>
            {data.map((row, i) => <RenderLogRow key={i} row={row} showTooltip={showTooltip} hideTooltip={hideTooltip} />)}
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