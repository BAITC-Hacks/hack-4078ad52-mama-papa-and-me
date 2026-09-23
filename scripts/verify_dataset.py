#!/usr/bin/env python3
"""Verify the supplied Markdown tables and two reference scores, not a runtime engine."""
from collections import Counter
from decimal import Decimal as D
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_tables():
    tables, rows = [], []
    source = (ROOT / 'docs/data/dataset-source.md').read_text()
    for line in source.splitlines() + ['']:
        if line.startswith('|'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            if not all(re.fullmatch(r':?-+:?', cell) for cell in cells):
                rows.append(cells)
        elif rows:
            require(all(len(row) == len(rows[0]) for row in rows), 'Table column mismatch')
            tables.append(rows)
            rows = []
    require(len(tables) == 6, 'Expected six source tables')
    return tables


def main():
    indicators, districts, measures, synergies, weights, example = read_tables()
    keys = [row[0] for row in indicators[1:]]
    require(keys == ['T1', 'T2', 'E1', 'E2', 'S1', 'S2', 'B1', 'B2', 'C1', 'C2'],
            'Unexpected indicators/order')
    require(len(districts) == 6 and len(measures) == 15, 'Expected 5 districts and 14 measures')
    require(districts[0][2:-1] == keys and weights[0][1:] == keys, 'Indicator columns differ')
    w = dict(zip(keys, map(D, weights[1][1:])))
    pop = {row[0]: D(row[1]) for row in districts[1:]}
    require(len(pop) == 5 and sum(pop.values()) == 1 and sum(w.values()) == 1,
            'Population shares and weights must each sum to one')
    initial = {row[0]: dict(zip(keys, map(D, row[2:-1]))) for row in districts[1:]}
    require(all(0 <= value <= 100 for values in initial.values() for value in values.values()),
            'Indicator out of range')
    for row in districts[1:]:
        require(sum(initial[row[0]][key] * w[key] for key in keys) == D(row[-1]),
                f'District total differs: {row[0]}')

    catalog = {}
    for mid, category, _title, scope, cost, lag, effects in measures[1:]:
        require(mid not in catalog, 'Duplicate measure')
        parsed = []
        for item in effects.replace('−', '-').split(','):
            match = re.fullmatch(r'\s*([TESBC][12])\s+([+-]\d+)\s*', item)
            require(match is not None, f'Unparsed effect: {mid}')
            parsed.append((match[1], D(match[2])))
        require(scope in {'Район', 'Город'} and 0 <= D(lag) <= 8 and D(cost) > 0,
                f'Invalid measure fields: {mid}')
        catalog[mid] = (category, scope, D(cost), D(lag), parsed)
    require(set(catalog) == {f'M{i}' for i in range(1, 15)}, 'Unexpected measure IDs')
    require(len({value[0] for value in catalog.values()}) == 5, 'Expected five directions')
    bonuses = []
    for pair, bonus in synergies[1:]:
        ids = pair.split(' + ')
        match = re.fullmatch(r'([TESBC][12]) \+(\d+) в районе (M\d+)', bonus)
        require(len(ids) == 2 and all(mid in catalog for mid in ids) and match is not None,
                'Invalid synergy row')
        require(match[3] == ids[0] and catalog[ids[0]][1] == 'Район', 'Wrong synergy target')
        bonuses.append((ids, match[1], D(match[2])))
    require(len(bonuses) == 3, 'Expected three synergies')

    selection = {row[1]: None if row[2] == 'город' else row[2] for row in example[1:]}
    require(len(selection) == len(example) - 1 == 5, 'Example needs five unique measures')
    require(all(mid in catalog for mid in selection), 'Unknown example measure')
    require(max(Counter(catalog[mid][0] for mid in selection).values()) <= 2,
            'Too many measures in a direction')
    cost = sum(catalog[mid][2] for mid in selection)
    require(cost == 95 and cost <= 100, 'Example cost differs')
    require(not {'M1', 'M3'} <= selection.keys(), 'Global conflict')
    for left, right in [('M4', 'M7'), ('M5', 'M13')]:
        require(not ({left, right} <= selection.keys() and selection[left] == selection[right]),
                'District conflict')
    final = {district: dict(values) for district, values in initial.items()}
    for mid, district in selection.items():
        _category, scope, _cost, lag, effects = catalog[mid]
        require((scope == 'Город' and district is None) or (scope == 'Район' and district in pop),
                f'Incorrect district: {mid}')
        for target in pop if scope == 'Город' else [district]:
            for key, effect in effects:
                final[target][key] += effect * (8 - lag) / 8
    for pair, key, effect in bonuses:
        if all(mid in selection for mid in pair):
            final[selection[pair[0]]][key] += effect
    final = {district: {key: max(D(0), min(D(100), value)) for key, value in values.items()}
             for district, values in final.items()}

    def score(values):
        totals = {district: sum(items[key] * w[key] for key in keys)
                  for district, items in values.items()}
        average = sum(pop[district] * total for district, total in totals.items())
        minimum = min(totals.values())
        critical = sum(value < 40 for items in values.values() for value in items.values())
        return average, minimum, critical, D('.7') * average + D('.3') * minimum - critical

    baseline = score(initial)
    result = score(final)
    require(baseline == (D('56.8624'), D('49.18'), 2, D('52.55768')), 'Baseline differs')
    require(result == (D('58.0776'), D('52.9625'), 0, D('56.54307')), 'Example differs')
    require(result[-1] - baseline[-1] == D('3.98539'), 'Score delta differs')
    print('PASS: 6 tables, 5 districts, 10 indicators, 14 measures, 3 synergies; weights/shares = 1.')
    print(f'PASS: baseline Score={baseline[-1]}; example cost={cost}, Score={result[-1]}, delta=3.98539.')
    print('LIMITS: independent Decimal check of source/reference values; not application tests '
          'or a replacement for engine validation and boundary tests.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, IndexError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
