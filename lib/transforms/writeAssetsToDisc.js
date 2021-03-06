const { promisify } = require('util');
const pMap = require('p-map');
const writeFile = promisify(require('fs').writeFile);
const Path = require('path');
const mkdirp = require('mkdirp');
const urlTools = require('urltools');

async function mkpathAndWriteFileAsync(fileName, contents, encoding) {
  try {
    await writeFile(fileName, contents, encoding);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await mkdirp(Path.dirname(fileName));
      await writeFile(fileName, contents, encoding);
    } else {
      throw err;
    }
  }
}

module.exports = (queryObj, outRoot, root) => {
  if (outRoot && !outRoot.startsWith('file://')) {
    outRoot = urlTools.fsDirToFileUrl(outRoot);
  }

  return async function writeAssetsToDisc(assetGraph) {
    await pMap(
      assetGraph.findAssets({
        isInline: false,
        fileRedirectTargetUrl: undefined, // FIXME: Dependency on non-public api. Smelly
        ...queryObj
      }),
      async asset => {
        let targetUrl;
        let error;

        if (outRoot) {
          targetUrl = urlTools.resolveUrl(
            outRoot,
            urlTools.buildRelativeUrl(root || assetGraph.root, asset.url)
          );
        } else {
          targetUrl = asset.url;
        }

        const fsPath = urlTools.fileUrlToFsPath(targetUrl);

        if (!/[^/]$/.test(fsPath)) {
          error = new Error(
            `Skipping ${asset.urlOrDescription} -- cannot write an empty file name to disc. Consider renaming it to index.html`
          );
          error.asset = asset;
          assetGraph.warn(error);
        } else {
          await mkpathAndWriteFileAsync(
            urlTools.fileUrlToFsPath(targetUrl),
            asset.rawSrc,
            null
          );
        }
      },
      { concurrency: 40 }
    );
  };
};
