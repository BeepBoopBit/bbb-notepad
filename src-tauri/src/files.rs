use serde::Serialize;
use std::io::Read;
use std::path::Path;
pub const MAX_FILE_BYTES: usize = 16 * 1024 * 1024;
const PREVIEW_BYTES: usize = 64 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub name: String,
    pub content: String,
    pub encoding: String,
    pub unsupported: bool,
    pub truncated: bool,
}
fn control(character: char) -> bool {
    character.is_control() && !matches!(character, '\n' | '\r' | '\t' | '\u{c}')
}
pub fn decode(name: String, bytes: &[u8]) -> OpenedFile {
    let mut encoding = "UTF-8";
    let mut content = None;
    let mut invalid = false;
    let bom_utf16 = bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]);
    let sample = &bytes[..bytes.len().min(4096)];
    let pairs = sample.len() / 2;
    let even_zeros = sample.iter().step_by(2).filter(|&&byte| byte == 0).count();
    let odd_zeros = sample
        .iter()
        .skip(1)
        .step_by(2)
        .filter(|&&byte| byte == 0)
        .count();
    let guess_le = pairs >= 2 && odd_zeros * 10 >= pairs * 3 && even_zeros * 20 <= pairs;
    let guess_be = pairs >= 2 && even_zeros * 10 >= pairs * 3 && odd_zeros * 20 <= pairs;
    if bom_utf16 || guess_le || guess_be {
        let little = bytes.starts_with(&[0xff, 0xfe]) || (!bom_utf16 && guess_le);
        encoding = if little { "UTF-16 LE" } else { "UTF-16 BE" };
        let body = if bom_utf16 { &bytes[2..] } else { bytes };
        let words: Vec<u16> = body
            .chunks_exact(2)
            .map(|chunk| {
                if little {
                    u16::from_le_bytes([chunk[0], chunk[1]])
                } else {
                    u16::from_be_bytes([chunk[0], chunk[1]])
                }
            })
            .collect();
        invalid = body.len() % 2 != 0 || String::from_utf16(&words).is_err();
        let mut text = String::from_utf16_lossy(&words);
        if body.len() % 2 != 0 {
            text.push('\u{fffd}');
        }
        if !text.chars().any(control) {
            content = Some(text);
        }
    } else {
        let body = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
        if let Ok(text) = std::str::from_utf8(body) {
            if !text.chars().any(control) {
                content = Some(text.to_string());
            }
        } else if !body
            .iter()
            .any(|&byte| byte < 32 && !matches!(byte, 9 | 10 | 12 | 13) || byte == 127)
        {
            encoding = "Windows-1252";
            let (text, _, errors) = encoding_rs::WINDOWS_1252.decode(body);
            invalid = errors;
            content = Some(text.into_owned());
        }
    }
    let binary = content.is_none();
    let content = content.unwrap_or_else(|| {
        bytes
            .iter()
            .take(PREVIEW_BYTES)
            .map(|&byte| match byte {
                9 | 10 | 13 | 32..=126 => byte as char,
                _ => '·',
            })
            .collect()
    });
    OpenedFile {
        name,
        content,
        encoding: if binary {
            "ASCII preview".into()
        } else {
            encoding.into()
        },
        unsupported: binary || invalid,
        truncated: binary && bytes.len() > PREVIEW_BYTES,
    }
}
pub fn read_file(path: &Path) -> Result<OpenedFile, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take((MAX_FILE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err("File is too large to open (maximum 16 MiB).".into());
    }
    Ok(decode(
        path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        &bytes,
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_encoding_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/files.json")).unwrap();
        for fixture in fixtures.as_array().unwrap() {
            let bytes: Vec<u8> = fixture["bytes"]
                .as_array()
                .unwrap()
                .iter()
                .map(|byte| byte.as_u64().unwrap() as u8)
                .collect();
            let result = decode("sample".into(), &bytes);
            assert_eq!(
                result.content,
                fixture["content"].as_str().unwrap(),
                "{}",
                fixture["name"]
            );
            assert_eq!(result.encoding, fixture["encoding"].as_str().unwrap());
            assert_eq!(
                result.unsupported,
                fixture["unsupported"].as_bool().unwrap()
            );
        }
    }
    #[test]
    fn binary_preview_is_bounded() {
        let result = decode("binary".into(), &vec![0; PREVIEW_BYTES + 10]);
        assert!(result.unsupported && result.truncated);
        assert_eq!(result.content.chars().count(), PREVIEW_BYTES);
    }
}
