import { useCallback } from 'react';
import { GLOSSARY } from '../../learn/glossary.ts';
import { type Lesson, LESSONS, type LessonView, type Milestone } from '../../learn/lessons.ts';
import { useLab } from '../../state/LabProvider.tsx';
import type { LabState } from '../../state/lab.ts';
import { HashPlayground } from './HashPlayground.tsx';
import { Quiz } from './Quiz.tsx';
import { RichText } from './RichText.tsx';
import { SignPlayground } from './SignPlayground.tsx';

/** Lesson progress lives in memory for the session, like the rest of the lab. */
export interface LessonProgress {
  readonly practiced: readonly string[];
  readonly correct: readonly string[];
  /** The open lesson (or 'glossary'), kept when you leave to try something in the lab. */
  readonly current: string;
}

export const initialLessonProgress: LessonProgress = { practiced: [], correct: [], current: 'hashing' };

function reached(state: LabState, m: Milestone): boolean {
  switch (m) {
    case 'root': return state.root !== null;
    case 'ministry': return Boolean(state.ministry?.certificate);
    case 'university': return Boolean(state.university?.certificate);
    case 'signed': return state.signed !== null;
  }
}

export function lessonStatus(l: Lesson, p: LessonProgress, state: LabState): { practiced: boolean; quizDone: boolean; done: boolean } {
  const practiced = p.practiced.includes(l.id) || (l.practice.kind === 'task' && l.practice.doneWhen !== null && reached(state, l.practice.doneWhen));
  const quizDone = l.quiz.every((q) => p.correct.includes(q.id));
  return { practiced, quizDone, done: practiced && quizDone };
}

export function LearnView(props: {
  progress: LessonProgress;
  onProgress: (update: (p: LessonProgress) => LessonProgress) => void;
  onNavigate: (view: LessonView) => void;
}) {
  const { progress, onProgress, onNavigate } = props;
  const { state } = useLab();
  const current = progress.current;
  const setCurrent = useCallback((id: string) => onProgress((p) => ({ ...p, current: id })), [onProgress]);
  const lesson = LESSONS.find((l) => l.id === current);
  const markPracticed = useCallback(
    (id: string) => onProgress((p) => (p.practiced.includes(id) ? p : { ...p, practiced: [...p.practiced, id] })),
    [onProgress],
  );
  const onPracticed = useCallback(() => lesson && markPracticed(lesson.id), [lesson, markPracticed]);
  const onCorrect = useCallback(
    (qid: string) => onProgress((p) => (p.correct.includes(qid) ? p : { ...p, correct: [...p.correct, qid] })),
    [onProgress],
  );
  const doneCount = LESSONS.filter((l) => lessonStatus(l, progress, state).done).length;

  return (
    <div className="learn">
      <nav className="learn__nav" aria-label="Lessons">
        <p className="learn__progress" role="status">{doneCount} of {LESSONS.length} lessons complete</p>
        <ol className="learn__list">
          {LESSONS.map((l) => {
            const s = lessonStatus(l, progress, state);
            return (
              <li key={l.id}>
                <button type="button" className="learn__item" aria-current={current === l.id ? 'page' : undefined} onClick={() => setCurrent(l.id)}>
                  <span className="learn__n">{l.n}</span>
                  <span className="learn__title">{l.title}</span>
                  <span className={s.done ? 'learn__state learn__state--done' : 'learn__state'}>{s.done ? 'Done' : s.practiced || s.quizDone ? 'Started' : ''}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="learn__item" aria-current={current === 'glossary' ? 'page' : undefined} onClick={() => setCurrent('glossary')}>
              <span className="learn__n" aria-hidden="true">·</span>
              <span className="learn__title">Glossary</span>
            </button>
          </li>
        </ol>
      </nav>

      {lesson ? (
        <article className="lesson" aria-labelledby="lesson-title">
          <p className="lesson__kicker">Lesson {lesson.n} of {LESSONS.length}, {lesson.course}</p>
          <h1 id="lesson-title" className="lesson__title">{lesson.title}</h1>
          {lesson.paragraphs.map((p, i) => (
            <p key={i} className="lesson__text"><RichText text={p} /></p>
          ))}

          <section className="lesson__section" aria-labelledby="practice-title">
            <h2 id="practice-title" className="section-title">Try it</h2>
            {lesson.practice.kind === 'playground' ? (
              <>
                <p className="lesson__text"><RichText text={lesson.practice.intro} /></p>
                {lesson.practice.playground === 'hash' ? <HashPlayground onPracticed={onPracticed} /> : <SignPlayground onPracticed={onPracticed} />}
              </>
            ) : (
              <div className="lesson__task">
                <p className="lesson__text"><RichText text={lesson.practice.task} /></p>
                <div className="playground__actions">
                  <button type="button" className="button button--primary" onClick={() => lesson.practice.kind === 'task' && onNavigate(lesson.practice.view)}>
                    {lesson.practice.label}
                  </button>
                  {lesson.practice.doneWhen === null && (
                    <button type="button" className="button" onClick={() => markPracticed(lesson.id)} disabled={progress.practiced.includes(lesson.id)}>
                      {progress.practiced.includes(lesson.id) ? 'Marked as done' : 'I’ve done this'}
                    </button>
                  )}
                </div>
                {lessonStatus(lesson, progress, state).practiced && <p className="pass-text" role="status">Done in the lab.</p>}
              </div>
            )}
          </section>

          <section className="lesson__section" aria-labelledby="quiz-title">
            <h2 id="quiz-title" className="section-title">Check your understanding</h2>
            <Quiz key={lesson.id} questions={lesson.quiz} onCorrect={onCorrect} />
          </section>

          <div className="lesson__pager">
            {lesson.n > 1 && (
              <button type="button" className="button" onClick={() => setCurrent((LESSONS[lesson.n - 2] as Lesson).id)}>Previous lesson</button>
            )}
            {lesson.n < LESSONS.length ? (
              <button type="button" className="button button--primary" onClick={() => setCurrent((LESSONS[lesson.n] as Lesson).id)}>Next lesson</button>
            ) : (
              <button type="button" className="button" onClick={() => setCurrent('glossary')}>Open the glossary</button>
            )}
          </div>
        </article>
      ) : (
        <article className="lesson" aria-labelledby="glossary-title">
          <h1 id="glossary-title" className="lesson__title">Glossary</h1>
          <dl className="glossary">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="glossary__row">
                <dt>{g.term}</dt>
                <dd><RichText text={g.meaning} /></dd>
              </div>
            ))}
          </dl>
        </article>
      )}
    </div>
  );
}
