"use client";

import type { UserPosition, YieldSourceAccount } from "@stablebond/types";
import { PositionRow } from "./PositionRow";

interface PositionTableProps {
  positions: UserPosition[];
  yieldSources: Map<number, YieldSourceAccount>;
}

export function PositionTable({ positions, yieldSources }: PositionTableProps) {
  if (positions.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-gray-400">No positions yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Deposit into a bond to get started
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <h2 className="mb-4 text-lg font-semibold text-white">Positions</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-3 text-gray-400">
            <th className="pb-3 pr-4 font-medium">Bond</th>
            <th className="pb-3 pr-4 font-medium">Tier</th>
            <th className="pb-3 pr-4 font-medium">Value</th>
            <th className="pb-3 pr-4 font-medium">Unrealized</th>
            <th className="pb-3 pr-4 font-medium">APY</th>
            <th className="pb-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <PositionRow
              key={pos.bondType}
              position={pos}
              yieldSource={yieldSources.get(pos.bondType)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
