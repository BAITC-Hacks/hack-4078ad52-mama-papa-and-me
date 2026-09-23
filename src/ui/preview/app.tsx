"use client";

import { CitySimulator } from "../features/city-simulator";
import { browserApi } from "./browser-api";

export function PreviewApp() {
  return <CitySimulator apiClient={browserApi} demo />;
}
