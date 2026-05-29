import fs from 'fs';

const tests = [
  "1. a",
  "1. a, b",
  "1. a,b",
  "1. a dan b",
  "1. a, b dan c"
];

tests.forEach(t => {
  const numMatch = t.match(/^(\d+)[\s\.\-\=\:]+(.*)/);
  if (numMatch) {
    const letters = Array.from(numMatch[2].matchAll(/\b([a-j])\b/g)).map(m => m[1]);
    console.log(t, '->', letters);
  }
});
