import { ClientSite } from "./site/ClientSite";
import { LangProvider } from "./i18n";
import { StoreProvider } from "./store";

export function App() {
  return (
    <StoreProvider>
      <LangProvider>
        <ClientSite />
      </LangProvider>
    </StoreProvider>
  );
}
