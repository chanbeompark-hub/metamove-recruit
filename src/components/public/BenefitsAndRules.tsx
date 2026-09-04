import type { PublishedSiteContent } from '../../content/types';

type BenefitsAndRulesProps = {
  benefits: PublishedSiteContent['benefits'];
  rules: PublishedSiteContent['rules'];
};

export function BenefitsAndRules({ benefits, rules }: BenefitsAndRulesProps) {
  const availableBenefits = benefits.filter(({ title, description }) => title.trim() && description.trim());
  const availableRules = rules.filter(({ label, value }) => label.trim() && value.trim());

  if (availableBenefits.length === 0 && availableRules.length === 0) {
    return null;
  }

  const sectionTitle = availableRules.length > 0 ? '혜택과 근무 규정' : '제공 혜택';

  return (
    <section className="benefits-rules" id="benefits-rules" aria-labelledby="benefits-rules-title">
      <div className="public-section__inner">
        <header className="public-section__header">
          <p className="public-section__eyebrow">CONDITIONS</p>
          <h2 id="benefits-rules-title">{sectionTitle}</h2>
        </header>
        <div className="benefits-rules__grid">
          {availableBenefits.length > 0 && (
            <div className="benefits-rules__benefits">
              <h3>혜택</h3>
              <ol>
                {availableBenefits.map((benefit, index) => (
                  <li key={benefit.id}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h4>{benefit.title}</h4>
                      <p>{benefit.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {availableRules.length > 0 && (
            <div className="benefits-rules__table-wrap">
              <table>
                <caption>근무 규정</caption>
                <tbody>
                  {availableRules.map((rule) => (
                    <tr key={rule.id}>
                      <th scope="row">{rule.label}</th>
                      <td>{rule.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
