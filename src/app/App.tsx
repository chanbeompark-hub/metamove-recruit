import { Route, Routes } from 'react-router-dom';
import { getPublishedContent } from '../content/getPublishedContent';
import { siteContent } from '../content/siteContent';
import { ApplicationLayout } from '../layouts/ApplicationLayout';
import { MarketingLayout } from '../layouts/MarketingLayout';
import { HomePage } from '../pages/HomePage';
import { ApplicationPage } from '../pages/ApplicationPage';
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
            <ApplicationPage />
          </ApplicationLayout>
        )}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
