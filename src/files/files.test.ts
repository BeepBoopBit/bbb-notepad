import {test,expect} from 'vitest';
import fixtures from '../../tests/fixtures/files.json';
import {decodeFile,fileName,MAX_FILE_BYTES} from './files';
for(const fixture of fixtures)test(fixture.name,()=>{const {content,encoding,unsupported}=decodeFile('sample',new Uint8Array(fixture.bytes));expect({content,encoding,unsupported}).toEqual({content:fixture.content,encoding:fixture.encoding,unsupported:fixture.unsupported});});
test('binary previews are bounded and large imports report a useful error',()=>{
  expect(decodeFile('binary',new Uint8Array(65550))).toMatchObject({unsupported:true,truncated:true});
  expect(()=>decodeFile('large',new Uint8Array(MAX_FILE_BYTES+1))).toThrow('16 MiB');
  expect(fileName('report.custom')).toBe('report.custom');expect(fileName('')).toBe('note.txt');
});
