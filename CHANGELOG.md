# Changelog

## [1.6.0](https://github.com/mitsuru2/my-azure-services/compare/v1.5.1...v1.6.0) (2026-08-01)


### Features

* SBI住信ネット銀行の入出金履歴に対応 ([275d8cf](https://github.com/mitsuru2/my-azure-services/commit/275d8cf0c0ece260afec2843973d4b6e64663ce9))
* 評価額と評価損益列も月末処理のコピー対象にするように修正 ([8c381b9](https://github.com/mitsuru2/my-azure-services/commit/8c381b9975d98e95f29472f0b0516a94795c46d8))


### Bug Fixes

* 出金レコードが判定できない不具合 ([4c5d5ff](https://github.com/mitsuru2/my-azure-services/commit/4c5d5ff40ed414c23ba20df612301fe79f3049b8))
* 日付データがテキストになっていた不具合 ([faf577d](https://github.com/mitsuru2/my-azure-services/commit/faf577deea099e9f309217f060f5433a4f8addec))
* 日付データがテキストになっていた不具合 ([161ce4a](https://github.com/mitsuru2/my-azure-services/commit/161ce4abfa4ba1083bf2153c22cd26a33e4c3b95))
* 日付データがテキストになっている不具合 ([9bd8376](https://github.com/mitsuru2/my-azure-services/commit/9bd83766350a2a65800afa3f97d0747725249dae))

## [1.5.1](https://github.com/mitsuru2/my-azure-services/compare/v1.5.0...v1.5.1) (2026-07-12)


### Bug Fixes

* NISA非課税配当を処理できない不具合を修正 ([d68c079](https://github.com/mitsuru2/my-azure-services/commit/d68c07965fd978220e494b186ba48455f357e397))

## [1.5.0](https://github.com/mitsuru2/my-azure-services/compare/v1.4.0...v1.5.0) (2026-07-09)


### Features

* 配当金履歴情報のインポート処理追加 ([3f9ede4](https://github.com/mitsuru2/my-azure-services/commit/3f9ede45bc8fcad3fc8f85ac88df1727e62043ea))

## [1.4.0](https://github.com/mitsuru2/my-azure-services/compare/v1.3.0...v1.4.0) (2026-07-08)


### Features

* 日時株価更新処理を追加。Azure Durable Functions 使用。 ([3f49d2a](https://github.com/mitsuru2/my-azure-services/commit/3f49d2a3d2a9720999159c0bc1155608b910d7c5))

## [1.3.0](https://github.com/mitsuru2/my-azure-services/compare/v1.2.0...v1.3.0) (2026-07-01)


### Features

* stock-price エンドポイントの追加。Azureへのデプロイ処理をコマンド化。 ([3cc0e50](https://github.com/mitsuru2/my-azure-services/commit/3cc0e508964a4b680dd494b1ddb09a1a5cd66b79))

## [1.2.0](https://github.com/mitsuru2/my-azure-services/compare/v1.1.0...v1.2.0) (2026-06-29)


### Features

* Add 'health' end point. ([edd643d](https://github.com/mitsuru2/my-azure-services/commit/edd643d5d4b3ed27e26ccafd6fd6e5f38fa3f1e3))
* IaCでのAzureリソース管理を開始。 ([91b5f54](https://github.com/mitsuru2/my-azure-services/commit/91b5f54e13cb3fb4b84fefcec5debbee199dd331))


### Bug Fixes

* I modified version mismatching of Node.js b/w described in Dockerfile and main.bicep. ([ab40ea7](https://github.com/mitsuru2/my-azure-services/commit/ab40ea704739cd98d9ab95d359f78d5896322baa))

## [1.1.0](https://github.com/mitsuru2/my-azure-services/compare/v1.0.0...v1.1.0) (2026-06-29)


### Features

* IaCでのAzureリソース管理を開始。 ([91b5f54](https://github.com/mitsuru2/my-azure-services/commit/91b5f54e13cb3fb4b84fefcec5debbee199dd331))

## 1.0.0 (2026-06-28)

### Features

- Add 'health' end point. ([edd643d](https://github.com/mitsuru2/my-azure-services/commit/edd643d5d4b3ed27e26ccafd6fd6e5f38fa3f1e3))
