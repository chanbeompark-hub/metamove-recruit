import type { ReactNode } from 'react';
import { MobileApplyBar } from '../components/public/MobileApplyBar';
import { PublicFooter } from '../components/public/PublicFooter';
import { PublicHeader } from '../components/public/PublicHeader';
import type { PublishedSiteContent } from '../content/types';

type MarketingLayoutProps = {
  children: ReactNode;
  content: PublishedSiteContent;
};

export function MarketingLayout({ children, content }: MarketingLayoutProps) {
  return (
    <div className="marketing-layout">
      <PublicHeader content={content} />
      {children}
      <PublicFooter />
      <MobileApplyBar />
    </div>
  );
}
