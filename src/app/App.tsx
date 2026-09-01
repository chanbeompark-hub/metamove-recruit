import { Route, Routes } from 'react-router-dom';
import { getPublishedContent } from '../content/getPublishedContent';
import { siteContent } from '../content/siteContent';
import { ApplicationLayout } from '../layouts/ApplicationLayout';
import { MarketingLayout } from '../layouts/MarketingLayout';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';

const publishedSiteContent = getPublishedContent(siteContent);

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={(
          <MarketingLayout content={publishedSiteContent}>
            <HomePage content={publishedSiteContent} />
          </MarketingLayout>
        )}
      />
      <Route
        path="/apply"
        element={(
          <ApplicationLayout>
            <main id="main-content" tabIndex={-1}><h1>지원서</h1></main>
          </ApplicationLayout>
        )}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
