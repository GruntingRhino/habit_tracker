/** Run one scheduled job by hand: npm run job -- judge */
import { JOBS } from "./jobs";

const name = process.argv[2] as keyof typeof JOBS;
if (!JOBS[name]) {
  console.error(`Usage: npm run job -- <${Object.keys(JOBS).join("|")}>`);
  process.exit(1);
}
const started = Date.now();
JOBS[name]()
  .then(() => {
    console.log(`${name} done in ${Date.now() - started}ms`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
