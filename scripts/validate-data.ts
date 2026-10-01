import { validateData } from '../src/data/validate';
import { AXES, BIOMES, VEHICLES, WOODS, PLOTS } from '../src/data/registry';

const errs = validateData();
console.log(
  `woods=${WOODS.length} axes=${AXES.length} vehicles=${VEHICLES.length} biomes=${BIOMES.length} plots=${PLOTS.length}`,
);
if (errs.length) {
  console.error('DATA VALIDATION FAILED:\n' + errs.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}
console.log('data OK');
