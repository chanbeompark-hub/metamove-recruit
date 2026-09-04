import { Link } from 'react-router-dom';
import type { PublishedSiteContent } from '../../content/types';
import { getRenderedPublicSectionIds, type PublicSectionId } from './publicSections';

type PublicHeaderProps = {
  content: PublishedSiteContent;
};

export function PublicHeader({ content }: PublicHeaderProps) {
  const renderedSectionIds = getRenderedPublicSectionIds(content);
  const hasRules = content.rules.some(({ label, value }) => label.trim() && value.trim());
  const growthAndVisionTarget = renderedSectionIds.has('vision')
    ? 'vision'
    : renderedSectionIds.has('growth') ? 'growth' : undefined;
  const visibleNavigationItems = [
    { label: '메타무브짐', id: 'metamove' },
    ...(growthAndVisionTarget ? [{ label: '성장과 비전', id: growthAndVisionTarget }] : []),
    { label: '대표 소개', id: 'representatives' },
    { label: hasRules ? '혜택·규정' : '제공 혜택', id: 'benefits-rules' },
    { label: '채용 포지션', id: 'positions' },
  ];

  return (
    <header className="public-header">
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      <div className="public-header__inner">
        <a className="public-header__brand" href="#metamove" aria-label="메타무브짐 홈">
          메타무브짐
        </a>
        <nav className="public-nav" aria-label="주요 메뉴">
          <div className="public-nav__sections">
            {visibleNavigationItems.filter((item) => renderedSectionIds.has(item.id as PublicSectionId)).map((item) => (
              <a
                className="public-nav__section-link"
                href={`#${item.id}`}
                key={item.id}
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
              >
                {item.label}
              </a>
            ))}
          </div>
          <Link className="public-header__apply" to="/apply">지원하기</Link>
        </nav>
      </div>
    </header>
  );
}
