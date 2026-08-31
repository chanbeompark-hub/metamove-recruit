import type { Representative } from '../../content/types';

type FounderPairProps = {
  people: Representative[];
};

export function FounderPair({ people }: FounderPairProps) {
  const availablePeople = people.filter(({ name, role }) => name.trim() && role.trim());

  if (availablePeople.length === 0) {
    return null;
  }

  return (
    <section className="founder-pair" id="representatives" aria-labelledby="representatives-title">
      <div className="public-section__inner">
        <header className="public-section__header public-section__header--inverse">
          <p className="public-section__eyebrow">PEOPLE</p>
          <h2 id="representatives-title">대표 소개</h2>
        </header>
        <div className="founder-pair__profiles" data-count={availablePeople.length}>
          {availablePeople.map((person, index) => (
            <article className="founder-profile" key={person.id}>
              {person.imageSrc && person.imageAlt && (
                <figure className="founder-profile__media">
                  <img src={person.imageSrc} alt={person.imageAlt} />
                </figure>
              )}
              <div className="founder-profile__details">
                <span className="founder-profile__number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="founder-profile__role">{person.role}</p>
                <h3>{person.name}</h3>
                {person.career.length > 0 && (
                  <ul aria-label={`${person.name} 경력`}>
                    {person.career.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                {person.expertise.length > 0 && (
                  <ul className="founder-profile__expertise" aria-label={`${person.name} 전문 분야`}>
                    {person.expertise.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
