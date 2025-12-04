import type { PropsWithChildren } from "react";

import "./Layout.css";

type LayoutProps = PropsWithChildren;

function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="layout__header">
        <h1>Echo</h1>
        <p>React + Django Starter</p>
      </header>
      <main className="layout__content">{children}</main>
    </div>
  );
}

export default Layout;





































