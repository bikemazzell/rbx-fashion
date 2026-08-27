import { h, render } from "preact";
import { DesignerApp } from "./designer-app";

export function mountDesignerApp(host: Element): void {
  render(h(DesignerApp, null), host);
}

export function unmountDesignerApp(host: Element): void {
  render(null, host);
}
