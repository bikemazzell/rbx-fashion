import { render } from "preact";
import { App } from "./app";
import { registerServiceWorker } from "./pwa/register";
import "./styles.css";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("missing #app mount point");
}
render(<App />, root);
registerServiceWorker();
