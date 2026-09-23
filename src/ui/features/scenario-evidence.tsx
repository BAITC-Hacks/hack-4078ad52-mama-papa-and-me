import type { ScenarioReport } from "@/contracts";
import { dataset } from "@/data";
import { districtName } from "./city-map";

const fmt = (value: number, digits = 2) => value.toLocaleString("ru-RU", {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});

export function ScenarioEvidence({ report }: { report: ScenarioReport }) {
  const critical = report.districts.flatMap((d) => dataset.indicators
    .filter((k) => d.indicators[k.id] < 40)
    .map((k) => ({ district: d.name, indicator: k.name, value: d.indicators[k.id] })));
  return (
    <section className="panel detailed-results" aria-label="Обоснование результата">
      <h3>Ваши решения и их вклад</h3>
      <p className="muted">Вклады показывают изменение показателей после лага. Их нельзя складывать как отдельные прибавки к Score.</p>
      {report.input.selections.map((selection) => {
        const measure = dataset.measures.find((m) => m.id === selection.measureId)!;
        return <details key={measure.id}>
          <summary>{measure.name} · {districtName(selection.districtId)} · {measure.cost} ед.</summary>
          <div className="table-scroll"><table>
            <thead><tr><th>Район</th><th>Показатель</th><th>Вклад после лага</th></tr></thead>
            <tbody>{report.contributions.filter((c) => c.measureId === measure.id).map((c) =>
              <tr key={c.districtId + "." + c.indicator}>
                <td>{districtName(c.districtId)}</td>
                <td>{dataset.indicators.find((i) => i.id === c.indicator)!.name}</td>
                <td>{c.effect > 0 ? "+" : ""}{fmt(c.effect)}</td>
              </tr>)}</tbody>
          </table></div>
        </details>;
      })}
      <h4>Оставшиеся критические показатели</h4>
      {critical.length === 0 ? <p>Показателей ниже 40 не осталось.</p> :
        <ul>{critical.map((c) => <li key={c.district + c.indicator}>
          {c.district} · {c.indicator}: {fmt(c.value)} — ниже 40
        </li>)}</ul>}
      <details>
        <summary>Почему получился такой Score</summary>
        <p>Средний индекс с учётом населения: {fmt(report.average, 5)}.</p>
        <p>Индекс слабейшего района: {fmt(report.minimum, 5)}.</p>
        <p>Штраф: {report.critical} критических показателей × 1 балл.</p>
        <p>0,7 × {fmt(report.average, 5)} + 0,3 × {fmt(report.minimum, 5)} − {report.critical} = {fmt(report.score!, 5)}.</p>
        <p className="muted">Расчёт выполняется без промежуточного округления. Числа здесь округлены только для отображения.</p>
        {report.clipping.length > 0 && <p>После сложения эффектов ограничены диапазоном от 0 до 100: {report.clipping.map((c) => districtName(c.districtId) + " / " + c.indicator).join(", ")}.</p>}
      </details>
    </section>
  );
}
