#[derive(Debug)]
pub struct Pair {
    pub key: String,
    pub value: String,
}
struct Range {
    key: String,
    value_from: usize,
    value_to: usize,
}
fn header(line: &str) -> Option<(String, usize)> {
    let spaces = line.bytes().take_while(|c| *c == b' ').count();
    if spaces > 3 {
        return None;
    }
    let text = line.get(spaces..)?.strip_prefix('!')?;
    let (key, _) = text.split_once(':')?;
    if !valid_key(key) {
        return None;
    }
    let start = spaces + 1 + key.len() + 1;
    let value = line[start..].trim_start_matches([' ', '\t']);
    Some((key.to_ascii_uppercase(), line.len() - value.len()))
}
fn valid_key(key: &str) -> bool {
    let mut chars = key.bytes();
    matches!(chars.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && chars.all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn fence_line(line: &str) -> Option<(u8, usize, &str)> {
    let spaces = line.bytes().take_while(|c| *c == b' ').count();
    if spaces > 3 {
        return None;
    }
    let rest = &line[spaces..];
    let first = *rest.as_bytes().first()?;
    if first != b'`' && first != b'~' {
        return None;
    }
    let size = rest.bytes().take_while(|c| *c == first).count();
    (size >= 3).then_some((first, size, &rest[size..]))
}
pub fn parse_pairs(source: &str) -> Vec<Pair> {
    let mut pairs: Vec<Range> = vec![];
    let mut stack: Vec<usize> = vec![];
    let mut offset = 0;
    let mut fence: Option<(u8, usize)> = None;
    for raw in source.split_inclusive('\n') {
        let line = raw.strip_suffix('\n').unwrap_or(raw);
        let line = line.strip_suffix('\r').unwrap_or(line);
        let previous = fence;
        if let Some((ch, size, tail)) = fence_line(line) {
            fence = match fence {
                None => Some((ch, size)),
                Some((old, len)) if old == ch && size >= len && tail.trim().is_empty() => None,
                other => other,
            };
        }
        if previous.is_some() || fence.is_some() {
            offset += raw.len();
            continue;
        }
        let spaces = line.bytes().take_while(|c| *c == b' ').count();
        if spaces <= 3 && line.trim() == "}" && !stack.is_empty() {
            let pair = &mut pairs[stack.pop().unwrap()];
            let end = if source[..offset].ends_with("\r\n") {
                offset.saturating_sub(2)
            } else {
                offset.saturating_sub(1)
            };
            pair.value_to = end.max(pair.value_from);
        } else if let Some((key, start)) = header(line) {
            let block = &line[start..] == "{";
            let from = if block {
                (offset + raw.len()).min(source.len())
            } else {
                offset + start
            };
            pairs.push(Range {
                key,
                value_from: from,
                value_to: if block {
                    source.len()
                } else {
                    offset + line.len()
                },
            });
            if block {
                stack.push(pairs.len() - 1);
            }
        }
        offset += raw.len();
    }
    pairs
        .into_iter()
        .map(|p| Pair {
            key: p.key,
            value: source[p.value_from..p.value_to].into(),
        })
        .collect()
}
pub fn search_query(query: &str) -> (Option<String>, &str) {
    let trimmed = query.trim();
    if trimmed
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("pair:"))
    {
        let tail = &trimmed[5..];
        let end = tail.find(char::is_whitespace).unwrap_or(tail.len());
        if valid_key(&tail[..end]) {
            return (
                Some(tail[..end].to_ascii_uppercase()),
                tail[end..].trim_start(),
            );
        }
    }
    (None, query)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_pair_fixtures() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/pairs.json")).unwrap();
        for fixture in fixtures.as_array().unwrap() {
            let pairs = parse_pairs(fixture["source"].as_str().unwrap());
            let actual: Vec<serde_json::Value> = pairs
                .iter()
                .map(|p| serde_json::json!({"key":p.key,"value":p.value}))
                .collect();
            assert_eq!(
                serde_json::json!(actual),
                fixture["pairs"],
                "{}",
                fixture["name"]
            );
        }
    }
}
