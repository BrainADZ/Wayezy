import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './styles/base.css';
import './styles/map.css';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Logo } from './brand/Logo';
import { ContentProvider } from './shared/content';
import { I18nProvider } from './shared/i18n';

const KioskApp = lazy(() => import('./kiosk/ExplorerKiosk'));
const GoApp = lazy(() => import('./go/GoApp'));
const CommandApp = lazy(() => import('./command/CommandApp'));
const RetailDetection = lazy(() => import('./explorer/RetailDetection'));

function Loading() {
  return (
    <div className="app-loading" role="status" aria-label="Loading">
      <Logo height={96} />
      <span className="splash-loader" />
    </div>
  );
}

function App() {
  const path = window.location.pathname;
  if (path === '/retail-detection')
    return (
      <Suspense fallback={<p>Loading detection…</p>}>
        <RetailDetection />
      </Suspense>
    );
  if (path.startsWith('/command')) {
    return (
      <Suspense fallback={<Loading />}>
        <CommandApp />
      </Suspense>
    );
  }
  const isGo = path.startsWith('/go');
  return (
    <I18nProvider>
      <ContentProvider>
        <Suspense fallback={<Loading />}>{isGo ? <GoApp /> : <KioskApp />}</Suspense>
      </ContentProvider>
    </I18nProvider>
  );
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
