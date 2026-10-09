export interface ChapterState {
  index?: number;
  title: string;
  subtitle?: string;
}

interface Props {
  card?: ChapterState;
}

export function ChapterCard({ card }: Props) {
  if (!card) {
    return null;
  }

  return (
    <div className="chapter" role="presentation">
      <div className="chapter__card" key={`${card.index}-${card.title}`}>
        <span className="chapter__badge">
          {card.index ? `Hồi ${card.index}` : "Hồi ký"}
        </span>

        <span className="chapter__title">{card.title}</span>

        {card.subtitle && (
          <span className="chapter__subtitle">{card.subtitle}</span>
        )}

        <span className="chapter__rule" aria-hidden="true" />
      </div>
    </div>
  );
}
