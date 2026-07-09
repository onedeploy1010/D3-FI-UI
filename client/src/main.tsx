import { createRoot } from "react-dom/client";
import App from "./App";
import { PrivyAppProvider } from "./providers/PrivyAppProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <PrivyAppProvider>
    <App />
  </PrivyAppProvider>,
);
