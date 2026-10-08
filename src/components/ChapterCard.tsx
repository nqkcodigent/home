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
      <div className="chapter__window">
        <div className="chapter__bar">
          {card.index ? `Hồi ${card.index}` : "Hồi ký"}
        </div>

        <div className="chapter__title">{card.title}</div>

        {card.subtitle && (
          <div className="chapter__subtitle">{card.subtitle}</div>
        )}
      </div>
    </div>
  );
}
