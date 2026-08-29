import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, CheckCircle2, ClipboardList, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Section, EmptyState, StatusBadge, FadeIn } from '@/components/kit';
import {
  trainingCourseService,
  type TrainingQuizSummary,
  type QuizQuestionInput,
} from '@/lib/api/trainingCourseService';

interface Props {
  courseId: string;
  quiz: TrainingQuizSummary | null;
  passingScore: number;
  readOnly: boolean;
  onChange: () => void;
}

interface QForm {
  prompt: string;
  options: string[];
  correctIndex: number;
}

const blankQ = (): QForm => ({ prompt: '', options: ['', ''], correctIndex: 0 });

export default function QuizManager({ courseId, quiz, passingScore, readOnly, onChange }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [passPct, setPassPct] = useState<number>(quiz?.passPct ?? passingScore ?? 70);
  // Se hidrata del cuestionario guardado. Antes arrancaba SIEMPRE en 5 y el
  // formulario reenviaba ese 5 en cada guardado: quien tuviera 10 preguntas por
  // intento las perdía la próxima vez que tocara cualquier otra cosa del
  // cuestionario, sin verlo. El respaldo es el valor por defecto del backend.
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState<number>(
    quiz?.questionsPerAttempt ?? 10,
  );
  const [questions, setQuestions] = useState<QForm[]>([blankQ()]);
  const [saving, setSaving] = useState(false);

  // El cuestionario puede llegar DESPUÉS del primer render (carga asíncrona del
  // curso). Sin esto, el valor real nunca sustituiría al inicial.
  useEffect(() => {
    if (quiz?.questionsPerAttempt != null) setQuestionsPerAttempt(quiz.questionsPerAttempt);
    if (quiz?.passPct != null) setPassPct(quiz.passPct);
  }, [quiz?.questionsPerAttempt, quiz?.passPct]);

  const addQuestion = () => setQuestions((qs) => [...qs, blankQ()]);
  const removeQuestion = (i: number) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  const setQ = (i: number, patch: Partial<QForm>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const addOption = (qi: number) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === qi ? { ...q, options: [...q.options, ''] } : q)));
  const setOption = (qi: number, oi: number, val: string) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? val : o)) } : q)));
  const removeOption = (qi: number, oi: number) =>
    setQuestions((qs) => qs.map((q, idx) => {
      if (idx !== qi) return q;
      const options = q.options.filter((_, j) => j !== oi);
      const correctIndex = q.correctIndex >= options.length ? 0 : q.correctIndex;
      return { ...q, options, correctIndex };
    }));

  const handleSave = async () => {
    const cleaned: QuizQuestionInput[] = questions
      .map((q) => ({
        prompt: q.prompt.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean),
        correctIndex: q.correctIndex,
      }))
      .filter((q) => q.prompt && q.options.length >= 2);

    if (cleaned.length === 0) {
      toast.error(t('ui.QuizManager.agregaAlMenosUnaPreguntaConDosOpciones', 'Agrega al menos una pregunta con dos opciones.'));
      return;
    }
    for (const q of cleaned) {
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        toast.error('Cada pregunta debe tener una respuesta correcta válida.');
        return;
      }
    }
    setSaving(true);
    try {
      await trainingCourseService.saveQuiz(courseId, {
        passPct: Number(passPct),
        questionsPerAttempt: Number(questionsPerAttempt) || cleaned.length,
        questions: cleaned,
      });
      toast.success('Cuestionario guardado.');
      setEditing(false);
      onChange();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg || t('ui.QuizManager.noSePudoGuardarElCuestionario', 'No se pudo guardar el cuestionario.'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <FadeIn>
        <Section title="Cuestionario" icon={<ClipboardList />}>
          {quiz ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--ok-text)' }} /> Cuestionario configurado
                </div>
                <p className="mt-1 flex items-center gap-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                  {t('ui.QuizManager.puntajeParaAprobar', 'Puntaje para aprobar:')} <StatusBadge tone="green" dot={false}>{quiz.passPct}%</StatusBadge>
                </p>
              </div>
              {!readOnly && (
                <Button variant="outline" onClick={() => { setPassPct(quiz.passPct ?? passingScore); setEditing(true); }}>
                  Editar / reemplazar preguntas
                </Button>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<HelpCircle />}
              title={t('ui.QuizManager.sinCuestionario', 'Sin cuestionario')}
              description="Un cuestionario es opcional. Si lo agregas, el vigilante debe aprobarlo para completar el curso."
              action={
                !readOnly ? (
                  <Button variant="brand" onClick={() => setEditing(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Crear cuestionario
                  </Button>
                ) : undefined
              }
            />
          )}
        </Section>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <Section title="Editar cuestionario" icon={<ClipboardList />} contentClassName="space-y-4">
        <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('comun.puntajeParaAprobar', 'Puntaje para aprobar (%)')}</Label>
            <Input type="number" min={0} max={100} value={passPct} onChange={(e) => setPassPct(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Preguntas por intento</Label>
            <Input type="number" min={1} value={questionsPerAttempt} onChange={(e) => setQuestionsPerAttempt(Number(e.target.value))} />
          </div>
        </div>

        {quiz && (
          <p className="text-xs" style={{ color: 'var(--warn-text)' }}>
            Al guardar se reemplazarán las preguntas existentes del cuestionario.
          </p>
        )}

        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={qi} className="glass-sunken space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <Label className="pt-2">Pregunta {qi + 1}</Label>
                {questions.length > 1 && (
                  <button aria-label="Eliminar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color: 'var(--bad-text)' }} onClick={() => removeQuestion(qi)}><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <Input placeholder={t('ui.QuizManager.enunciadoDeLaPregunta', 'Enunciado de la pregunta')} value={q.prompt} onChange={(e) => setQ(qi, { prompt: e.target.value })} />
              <div className="space-y-2">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={q.correctIndex === oi}
                      onChange={() => setQ(qi, { correctIndex: oi })}
                      title="Marcar como correcta"
                      className="h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <Input placeholder={`Opción ${oi + 1}`} value={o} onChange={(e) => setOption(qi, oi, e.target.value)} />
                    {q.options.length > 2 && (
                      <button aria-label="Eliminar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ color: 'var(--bad-text)' }} onClick={() => removeOption(qi, oi)}><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => addOption(qi)}>
                  <Plus className="h-3 w-3 mr-1" /> {t('ui.QuizManager.opcion', 'Opción')}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" onClick={addQuestion}><Plus className="h-4 w-4 mr-1" /> Agregar pregunta</Button>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
          <Button variant="brand" disabled={saving} onClick={handleSave}>
            {saving ? 'Guardando...' : 'Guardar cuestionario'}
          </Button>
        </div>
      </Section>
    </FadeIn>
  );
}
