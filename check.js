import { promises as fs } from "fs";

const hyperTrace = await fs.readFile("hyper.txt", "utf8").then((data) => data.split("\n"));
const castTrace = await fs.readFile("cast.txt", "utf8").then((data) => data.split("\n"));

let hyperIndex = 0;
let castIndex = 0;
let skip = 0;

const parseHyper = (index) => {
  const trace = hyperTrace[index];
  if (!trace) return;

  const splited = trace.split(" ");
  if (splited[0] !== "depth:") {
    hyperIndex++;
    return parseHyper(hyperIndex);
  }
  const depth = splited[1];
  const pc = splited[2];
  const op = splited[4];
  const stack = splited[6]
    .split(",")
    .filter((s) => s !== "")
    .map((s) => BigInt("0x" + s));
  return { depth, pc, op, stack };
};

const parseCast = (index) => {
  const trace = castTrace[index];
  if (!trace) return;

  if (!trace.startsWith("depth:")) {
    castIndex++;
    return parseCast(castIndex);
  }

  const splited2 = trace.split(" ");
  const depth = splited2[0].split(":")[1].slice(0, -1);
  const pc = splited2[1].split(":")[1].slice(0, -1);
  const op = splited2[4].split('"')[1];
  const regexstack = /Stack:\[[^\]]*\]/g;
  const stackstr = trace.match(regexstack)[0];
  const regexuint = /0x[a-fA-F0-9]{64}/g;
  const stack = [...stackstr.matchAll(regexuint)].map((match) => BigInt(match[0]));

  return { depth, pc, op, stack };
};

while (hyperTrace.length > hyperIndex && castTrace.length > castIndex) {
  const hyper = parseHyper(hyperIndex);
  const cast = parseCast(castIndex);
  if (!hyper || !cast) break;

  hyperIndex++;
  castIndex++;

  const isMismatch = hyper.depth !== cast.depth || hyper.pc !== cast.pc || hyper.op !== cast.op;
  const isStackMismatch = hyper.stack.length !== cast.stack.length || hyper.stack.some((s, i) => s !== cast.stack[i]);

  if (isMismatch || isStackMismatch) {
    console.log("mismatch");

    console.log("depth", hyper.depth, cast.depth);
    console.log("pc", hyper.pc, cast.pc);
    console.log("op", hyper.op, cast.op);
    console.log("stack", hyper.stack, cast.stack);
    const stackDiffIndex = hyper.stack.findIndex((s, i) => s !== cast.stack[i]);
    console.log(stackDiffIndex);

    if (hyper.op.includes("CALL")) continue;

    if (skip === 0) break;
    skip--;
  }
}
