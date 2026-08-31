import { Route, Routes } from 'react-router-dom';
import { MobileApplyBar } from '../components/public/MobileApplyBar';
import { PublicFooter } from '../components/public/PublicFooter';
import { PublicHeader } from '../components/public/PublicHeader';
import { getPublishedContent } from '../content/getPublishedContent';
import { siteContent } from '../content/siteContent';
import { HomePage } from '../pages/HomePage';

const publishedSiteContent = getPublishedContent(siteContent);

export function App() {
  return (
    <>
      <PublicHeader content={publishedSiteContent} />
      <Routes>
        <Route path="/" element={<HomePage content={publishedSiteContent} />} />
        <Route path="/apply" element={<main id="main-content" tabIndex={-1}><h1>지원서</h1></main>} />
      </Routes>
      <PublicFooter />
      <MobileApplyBar />
    </>
  );
}
