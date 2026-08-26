import { useState } from "preact/hooks";

export function App() {
  const [status, setStatus] = useState("Ready");

  return (
    <main>
      <h1>Roblox Clothing Designer</h1>
      <p role="status">{status}</p>
      <button
        onClick={async () => {
          const preview = await import("./preview/preview.ts");
          setStatus(`Preview engine ready (${preview.placeholder()})`);
        }}
      >
        Load 3D preview
      </button>
    </main>
  );
}
