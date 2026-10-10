import { useId, useState } from 'react';
import { type Diploma, SAMPLE_DIPLOMA } from '../../documents/diploma.ts';

const CGPA = /^[0-4]\.\d{2}$/;

export function validateDiploma(d: Diploma): string | null {
  if (!d.studentName.trim() || d.studentName.length > 80) return 'Enter the student’s name (up to 80 characters).';
  if (d.studentNameAmharic.length > 80) return 'The Amharic name is limited to 80 characters.';
  if (!d.degree.trim() || d.degree.length > 120) return 'Enter the degree (up to 120 characters).';
  if (!CGPA.test(d.cgpa) || Number(d.cgpa) > 4) return 'CGPA must look like 3.12 and be at most 4.00.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.conferred)) return 'Choose the date the degree was conferred.';
  return null;
}

export function DiplomaForm({ disabled, onSign }: { disabled: boolean; onSign: (d: Diploma) => void }) {
  const [draft, setDraft] = useState<Diploma>(SAMPLE_DIPLOMA);
  const [touched, setTouched] = useState(false);
  const id = useId();
  const problem = validateDiploma(draft);
  const set = (k: keyof Diploma) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });

  const fields: Array<[keyof Diploma, string, string, string?]> = [
    ['studentName', 'Student name', 'text'],
    ['studentNameAmharic', 'Student name in Amharic', 'text', 'am'],
    ['degree', 'Degree', 'text'],
    ['cgpa', 'Cumulative GPA', 'text'],
    ['conferred', 'Conferred on', 'date'],
  ];

  return (
    <form
      className="diploma-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!problem) onSign(draft);
      }}
    >
      <div className="diploma-form__grid">
        {fields.map(([key, label, type, lang]) => (
          <div key={key} className="field">
            <label htmlFor={`${id}-${key}`}>{label}</label>
            <input
              id={`${id}-${key}`}
              type={type}
              lang={lang}
              value={draft[key]}
              onChange={set(key)}
              disabled={disabled}
              inputMode={key === 'cgpa' ? 'decimal' : undefined}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
      <p className="diploma-form__fixed">
        Issued by {draft.institution} (<span lang="am">{draft.institutionAmharic}</span>), diploma {draft.diplomaId}
      </p>
      {touched && problem && (
        <p className="form-error" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" className="button button--primary" disabled={disabled}>
        Sign diploma with the University’s key
      </button>
    </form>
  );
}
