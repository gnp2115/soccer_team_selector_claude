// Runs every test file. `npm test` points here.
import "./balancing.test";
import "./pitch.test";
import "./parsing.test";
import { summary } from "./check";

summary();
