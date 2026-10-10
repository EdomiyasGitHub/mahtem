import { useId, useState } from 'react';
import type { QuizQuestion } from '../../learn/lessons.ts';
import { RichText } from './RichText.tsx';

function Question({ q, onCorrect }: { q: QuizQuestion; onCorrect: (id: string) => void }) {
  const id = useId();
  const [chosen, setChosen] = useState<number | null>(null);
  const option = chosen !== null ? q.options[chosen] : undefined;
  return (
    <fieldset className="quiz__q">
      <legend className="quiz__prompt"><RichText text={q.prompt} /></legend>
      {q.options.map((o, i) => (
        <label key={i} className="quiz__option">
          <input type="radio" name={id} checked={chosen === i}
            onChange={() => {
              setChosen(i);
              if (o.correct) onCorrect(q.id);
            }} />
          <span><RichText text={o.text} /></span>
        </label>
      ))}
      {option && (
        <p className={option.correct ? 'quiz__why quiz__why--right' : 'quiz__why quiz__why--wrong'} role="status">
          <strong>{option.correct ? 'Right.' : 'Not quite.'}</strong> <RichText text={option.why} />
        </p>
      )}
    </fieldset>
  );
}

export function Quiz({ questions, onCorrect }: { questions: readonly QuizQuestion[]; onCorrect: (id: string) => void }) {
  return (
    <div className="quiz">
      {questions.map((q) => (
        <Question key={q.id} q={q} onCorrect={onCorrect} />
      ))}
    </div>
  );
}
