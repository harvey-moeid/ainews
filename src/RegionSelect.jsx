import React from "react";
import { NATIONAL_REGION, REGION_GROUPS } from "../shared/regions.js";

export default function RegionSelect({ all = false, ...props }) {
  return (
    <select {...props}>
      {all && <option value="Semua wilayah">Semua wilayah</option>}
      <option value={NATIONAL_REGION}>Indonesia</option>
      {REGION_GROUPS.map(({ province, regions }) => (
        <optgroup key={province} label={province}>
          {regions.map((region) => (
            <option key={region}>{region}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
