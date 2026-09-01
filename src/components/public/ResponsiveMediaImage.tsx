import type { CSSProperties } from 'react';
import type { ResponsiveMedia } from '../../content/types';

type ResponsiveMediaImageProps = {
  media: ResponsiveMedia;
};

type MediaStyle = CSSProperties & {
  '--media-desktop-position': string;
  '--media-mobile-position': string;
};

export function ResponsiveMediaImage({ media }: ResponsiveMediaImageProps) {
  if (!media.imageSrc || !media.imageAlt) {
    return null;
  }

  const desktopPosition = media.desktopObjectPosition ?? '50% 50%';
  const mediaStyle: MediaStyle = {
    '--media-desktop-position': desktopPosition,
    '--media-mobile-position': media.mobileObjectPosition ?? desktopPosition,
  };

  return (
    <picture className="responsive-media">
      {media.mobileImageSrc && (
        <source media="(max-width: 767px)" srcSet={media.mobileImageSrc} />
      )}
      <img
        className="responsive-media__image"
        src={media.imageSrc}
        alt={media.imageAlt}
        style={mediaStyle}
      />
    </picture>
  );
}
