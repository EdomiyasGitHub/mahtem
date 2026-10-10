import { useState } from 'react';
import { SpotTheFake } from './SpotTheFake.tsx';
import { ThreeMessages } from './ThreeMessages.tsx';

export function ExercisesView() {
  const [which, setWhich] = useState<'spot' | 'three'>('spot');
  return (
    <div className="exercises">
      <section className="intro" aria-labelledby="ex-title">
        <h1 id="ex-title" className="intro__title">Exercises</h1>
        <p className="intro__lede">Practise what the lessons teach, alone or with a partner.</p>
      </section>
      <div className="segmented" role="group" aria-label="Exercise">
        <button type="button" className="segmented__btn" aria-pressed={which === 'spot'} onClick={() => setWhich('spot')}>Spot the fake</button>
        <button type="button" className="segmented__btn" aria-pressed={which === 'three'} onClick={() => setWhich('three')}>Three messages (course §6)</button>
      </div>
      <div className="exercises__panel" hidden={which !== 'spot'}><SpotTheFake /></div>
      <div className="exercises__panel" hidden={which !== 'three'}><ThreeMessages /></div>
    </div>
  );
}
