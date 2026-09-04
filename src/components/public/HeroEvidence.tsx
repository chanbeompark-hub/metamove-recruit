import { Link } from 'react-router-dom';
import type { PublishedSiteContent } from '../../content/types';
import { ResponsiveMediaImage } from './ResponsiveMediaImage';
import './evidence.css';

type HeroContent = PublishedSiteContent['hero'];

type HeroEvidenceProps = {
  hero: HeroContent;
};

export function HeroEvidence({ hero }: HeroEvidenceProps) {
  const hasApprovedMedia = Boolean(hero.imageSrc && hero.imageAlt);

  return (
    <section className="hero-evidence" id="metamove" aria-labelledby="hero-evidence-title">
      <div className="hero-evidence__inner">
        <div className="hero-evidence__content">
          <span className="hero-evidence__structural-line" aria-hidden="true" />
          <h1 className="hero-evidence__headline" id="hero-evidence-title">
            {hero.headline}
          </h1>
          {hero.supportingCopy && (
            <p className="hero-evidence__supporting-copy">{hero.supportingCopy}</p>
          )}
          <Link className="hero-evidence__action" to="/apply">
            지원서 미리보기
            <span className="hero-evidence__action-arrow" aria-hidden="true">→</span>
          </Link>
        </div>

        {hasApprovedMedia ? (
          <figure className="hero-evidence__field hero-evidence__field--media">
            <ResponsiveMediaImage media={hero} />
          </figure>
        ) : (
          <div className="hero-evidence__field hero-evidence__field--structural" aria-hidden="true">
            <span className="hero-evidence__axis hero-evidence__axis--horizontal" />
            <span className="hero-evidence__axis hero-evidence__axis--vertical" />
            <span className="hero-evidence__marker" />
          </div>
        )}
      </div>
    </section>
  );
}
