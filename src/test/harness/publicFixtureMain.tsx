import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MarketingLayout } from '../../layouts/MarketingLayout';
import { HomePage } from '../../pages/HomePage';
import '../../styles/tokens.css';
import '../../styles/global.css';
import { publishedFixture } from '../fixtures/siteContent';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Fixture root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <MarketingLayout content={publishedFixture}>
        <HomePage content={publishedFixture} />
      </MarketingLayout>
    </BrowserRouter>
  </StrictMode>,
);
