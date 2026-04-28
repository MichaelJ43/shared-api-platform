# ip2region xdb (official)

Binaries are **not** committed (large). They are fetched by:

- `npm run ensure:xdb`
- `npm run build` and `npm test` (both run `ensure:xdb` first)

Source: [lionsoul2014/ip2region `data/`](https://github.com/lionsoul2014/ip2region/tree/master/data) (`ip2region_v4.xdb`, `ip2region_v6.xdb`).

Locale: per upstream, **China** regions are labeled in **Chinese**; **non-China** (e.g. United States) use **English**. This replaces the legacy npm `ip2region` package’s `.db`, which often showed US locations in Chinese.
