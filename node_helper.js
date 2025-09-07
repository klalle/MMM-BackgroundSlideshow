/*
 * node_helper.js
 *
 * MagicMirror²
 * Module: MMM-BackgroundSlideshow
 *
 * MagicMirror² By Michael Teeuw https://michaelteeuw.nl
 * MIT Licensed.
 *
 * Module MMM-BackgroundSlideshow By Darick Carpenter
 * MIT Licensed.
 */

// call in the required classes
const NodeHelper = require('node_helper');
const fs = require('fs');
const os = require('os');
const {exec} = require('child_process');
const express = require('express');
const Log = require('../../js/logger.js');
const basePath = '/images/';
const sharp = require('sharp');
const path = require('path');

// the main module helper create
module.exports = NodeHelper.create({

  // subclass start method, clears the initial config array
  start () {
    this.excludePaths = new Set();
    this.validImageFileExtensions = new Set();
    this.expressInstance = this.expressApp;
    this.imageList = [];
    this.alreadyShownSet = new Set();
    this.index = 0;
    this.timer = null;
    self = this;

    Log.log(`[${this.name}] Sätter upp cache-sökväg och express-route.`);

    this.cachePath = path.join(__dirname, 'cache');

    if (fs.existsSync(this.cachePath)) {
      // Om mappen finns, rensa den från gamla bilder från förra körningen
      Log.log(`[${this.name}] Cache-mapp finns. Rensar den från gamla filer.`);
      this.cleanupCache();
    } else {
      fs.mkdirSync(this.cachePath);
      Log.log(`[${this.name}] Skapade cache-mapp: ${this.cachePath}`);

    }

    // Använd MagicMirrors express-instans för att servera filer från din cache-mapp.
    // URL:en blir /MMM-BackgroundSlideshow/cache/<filnamn>
    this.expressApp.use(`/${this.name}/cache`, express.static(this.cachePath));

    Log.log(`[${this.name}] Serverar nu filer från cachen på /${this.name}/cache`);
  },
  cleanupCache () {
    fs.readdir(this.cachePath, (err, files) => {
      if (err) {
        Log.error(`[${this.name}] Fel vid läsning av cache-mapp:`, err);
        return;
      }

      if (files.length === 0) {
        Log.log(`[${this.name}] Cache-mappen var redan tom.`);
        return;
      }

      for (const file of files) {
        fs.unlink(path.join(this.cachePath, file), (error) => {
          if (error) {
            Log.error(`[${this.name}] Fel vid radering av cache-fil ${file}:`, error);
          }
        });
      }
      Log.log(`[${this.name}] Rensade ${files.length} fil(er) från cachen.`);
    });
  },


  // shuffles an array at random and returns it
  shuffleArray (array) {
    for (let i = array.length - 1; i > 0; i--) {
      // j is a random index in [0, i].
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  shuffleImagesLoopFolders (filePaths) {
    Log.log('shuffleImagesLoopFolders = true!');
    // Log.log(`filePaths: \n${filePaths.map(img => img.path + "\n")}`);
    const groupedByFolder = new Map();
    for (const imgobject of filePaths) {
      const parts = imgobject.path.split('/');
      const folder = parts[parts.length - 2]; // or use the config.imagePaths?
      if (!groupedByFolder.has(folder)) {
        groupedByFolder.set(folder, []);
      }
      groupedByFolder.get(folder).push(imgobject);
    }
    // find subfolder with max amount of images:
    let maxLength = 0;
    for (const imageArray of groupedByFolder.values()) {
      maxLength = Math.max(maxLength, imageArray.length);
    }

    // shuffle all subfolders individually
    for (const folderPaths of groupedByFolder.values()) {
      this.shuffleArray(folderPaths);
    }

    const result = [];
    const folderKeys = Array.from(groupedByFolder.keys());
    // map of pointers to keep track of image index for subfolders
    const pointers = new Map(folderKeys.map((key) => [key, 0]));
    let lastPickedFolder = null;

    for (let i = 0; i < maxLength; i++) {
      // re-shuffle subfolders so that the order is not the same
      const pickableFolders = this.shuffleArray(folderKeys);
      if (pickableFolders[0] === lastPickedFolder) {
        // simply swap first/last if lastpickedfolder happened to be first
        [pickableFolders[0], pickableFolders[pickableFolders.length - 1]] =
          [pickableFolders[pickableFolders.length - 1], pickableFolders[0]];
      }
      for (const nextFolder of pickableFolders) {
        const imagePointer = pointers.get(nextFolder);
        const image = groupedByFolder.get(nextFolder)[imagePointer];

        result.push(image);

        if (imagePointer + 1 === groupedByFolder.get(nextFolder).length) {
          // current folder has run out of images, restart this folder
          this.shuffleArray(groupedByFolder.get(nextFolder));
          pointers.set(nextFolder, 0);
        } else {
          pointers.set(nextFolder, imagePointer + 1);
        }
        lastPickedFolder = nextFolder; // we dont want the same folder in a row
      }
    }
    return result;
  },


  // sort by filename attribute
  sortByFilename (a, b) {
    const aL = a.path.toLowerCase();
    const bL = b.path.toLowerCase();
    if (aL > bL) return 1;
    return -1;
  },

  // sort by created attribute
  sortByCreated (a, b) {
    const aL = a.created;
    const bL = b.created;
    if (aL > bL) return 1;
    return -1;
  },

  // sort by created attribute
  sortByModified (a, b) {
    const aL = a.modified;
    const bL = b.modified;
    if (aL > bL) return 1;
    return -1;
  },

  sortImageList (imageList, sortBy, sortDescending) {
    let sortedList = imageList;
    switch (sortBy) {
      case 'created':
        // Log.log('Sorting by created date...');
        sortedList = imageList.sort(this.sortByCreated);
        break;
      case 'modified':
        // Log.log('Sorting by modified date...');
        sortedList = imageList.sort(this.sortByModified);
        break;
      default:
        // sort by name
        // Log.log('Sorting by name...');
        sortedList = imageList.sort(this.sortByFilename);
    }

    // If the user chose to sort in descending order then reverse the array
    if (sortDescending === true) {
      // Log.log('Reversing sort order...');
      sortedList = sortedList.reverse();
    }

    return sortedList;
  },

  // checks there's a valid image file extension
  checkValidImageFileExtension (filename) {
    if (!filename.includes('.')) {
      // No file extension.
      return false;
    }
    const fileExtension = filename.split('.').pop()
      .toLowerCase();
    return this.validImageFileExtensions.has(fileExtension);
  },
  excludedFiles (currentDir) {
    try {
	  const excludedFile = fs.readFileSync(`${currentDir}/excludeImages.txt`, 'utf8');
	  const listOfExcludedFiles = excludedFile.split(/\r?\n/u);
	  Log.info(`found excluded images list: in dir: ${currentDir} containing: ${listOfExcludedFiles.length} files`);
	  return listOfExcludedFiles;
    } catch (err) {
	  // no excludeImages.txt in current folder
	  return [];
    }
  },
  isExcluded (filename, excludedImagesList) {
	  if (excludedImagesList.includes(filename.replace(/\.[a-zA-Z]{3,4}$/u, ''))) {
		  Log.info(`${filename} is excluded in excludedImages.txt!`);
		  return true;
	  }
		  return false;
  },
  readEntireShownFile () {
	  const filepath = 'modules/MMM-BackgroundSlideshow/filesShownTracker.txt';
    try {
      const filesShown = fs.readFileSync(filepath, 'utf8');
      const listOfShownFiles = filesShown.split(/\r?\n/u).filter((line) => line.trim() !== '');
      Log.info(`found filesShownTracker: in path: ${filepath} containing: ${listOfShownFiles.length} files`);
      return new Set(listOfShownFiles);
    } catch (err) {
      Log.info(`error reading filesShownTracker: in path: ${filepath}`);
      // no excludeImages.txt in current folder
      return new Set();
    }
  },
  addImageToShown (imgPath) {
	  self.alreadyShownSet.add(imgPath);
	  const filePath = 'modules/MMM-BackgroundSlideshow/filesShownTracker.txt';
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `${imgPath}\n`, {flag: 'wx'});
    } else {
      fs.appendFileSync(filePath, `${imgPath}\n`);
    }
  },
  resetShownImagesFile () {
    try {
      fs.writeFileSync('modules/MMM-BackgroundSlideshow/filesShownTracker.txt', '', 'utf8');
    } catch (err) {
      console.error('Error writing empty filesShownTracker.txt', err);
    }
  },
  // gathers the image list
  gatherImageList (config, sendNotification) {
    // Invalid config. retrieve it again
    if (typeof config === 'undefined' || !Object.hasOwn(Object(config), 'imagePaths')) {
      this.sendSocketNotification('BACKGROUNDSLIDESHOW_REGISTER_CONFIG');
      return;
    }
    // create an empty main image list
    this.imageList = [];
    if (config.showAllImagesBeforeRestart) {
      this.alreadyShownSet = this.readEntireShownFile();
    }
    for (let i = 0; i < config.imagePaths.length; i++) {
	    const excludedImagesList = this.excludedFiles(config.imagePaths[i]);
      this.getFiles(config.imagePaths[i], this.imageList, excludedImagesList, config);
    }
    const imageListToUse = config.showAllImagesBeforeRestart
	  ? this.imageList.filter((image) => !this.alreadyShownSet.has(image.path))
      : this.imageList;

    Log.info(`skipped ${this.imageList.length - imageListToUse.length} files since allready seen!`);
    let finalImageList;

    if (config.randomizeImagesLoopFolders) {
      finalImageList = this.shuffleImagesLoopFolders(imageListToUse);
    } else if (config.randomizeImageOrder) {
      finalImageList = this.shuffleArray(imageListToUse);
    } else {
      finalImageList = this.sortImageList(
        imageListToUse,
        config.sortImagesBy,
        config.sortImagesDescending
      );
    }

    this.imageList = finalImageList;
    Log.info(`BACKGROUNDSLIDESHOW: ${this.imageList.length} files found`);
    // Log.log(`BACKGROUNDSLIDESHOW: ${this.imageList.map(img => img.path + "\n")}`);
    this.index = 0;

    // let other modules know about slideshow images
    this.sendSocketNotification('BACKGROUNDSLIDESHOW_FILELIST', {
      imageList: this.imageList
    });

    // build the return payload
    const returnPayload = {
      identifier: config.identifier
    };

    // signal ready
    if (sendNotification) {
      this.sendSocketNotification('BACKGROUNDSLIDESHOW_READY', returnPayload);
    }
  },

  getNextImage () {
    if (!this.imageList.length || this.index >= this.imageList.length) {
      // if there are no images or all the images have been displayed, try loading the images again
      if (this.config.showAllImagesBeforeRestart) {
        this.resetShownImagesFile();
      }
      this.gatherImageList(this.config);
    }
    //
    if (!this.imageList.length) {
      // still no images, search again after 10 mins
      setTimeout(() => {
        this.getNextImage(this.config);
      }, 600000);
      return;
    }

    const image = this.imageList[this.index++];
    Log.info(`BACKGROUNDSLIDESHOW: reading path "${image.path}"`);
    self = this;
    this.readFile(image.path, (imageUrl) => {
      // 'imageUrl' är nu t.ex. "/MMM-BackgroundSlideshow/cache/12345678-bild.jpg"

      const returnPayload = {
        identifier: this.config.identifier,
        path: image.path,
        url: imageUrl,
        index: this.index,
        total: this.imageList.length
      };

      this.sendSocketNotification(
        'BACKGROUNDSLIDESHOW_IMAGE_URL',
        returnPayload
      );
    });
    // (re)set the update timer
    this.startOrRestartTimer();
  	if (this.config.showAllImagesBeforeRestart) {
	  this.addImageToShown(image.path);
    }
  },

  // stop timer if it's running
  stopTimer () {
    if (this.timer) {
      Log.debug('BACKGROUNDSLIDESHOW: stopping update timer');
      const it = this.timer;
      this.timer = null;
      clearTimeout(it);
    }
  },
  // resume timer if it's not running; reset if it is
  startOrRestartTimer () {
    this.stopTimer();
    Log.debug('BACKGROUNDSLIDESHOW: restarting update timer');
    this.timer = setTimeout(() => {
      self.getNextImage();
    }, self.config?.slideshowSpeed || 10000);
  },

  getPrevImage () {
    // imageIndex is incremented after displaying an image so -2 is needed to
    // get to previous image index.
    this.index -= 2;

    // Case of first image, go to end of array.
    if (this.index < 0) {
      this.index = 0;
    }
    this.getNextImage();
  },
  async resizeImage (imagePath, callback) {
    Log.log(`resizing image to max: ${this.config.maxWidth}x${this.config.maxHeight}`);
    const {maxHeight: screenHeight, maxWidth: screenWidth} = this.config;
    const screenIsPortrait = screenHeight >= screenWidth;

    const {width, height, orientation} = await sharp(imagePath).metadata();
    const flipped = orientation >= 5;
    const [imageWidth, imageHeight] = flipped
      ? [height, width]
      : [width, height];
    const imageIsPortrait = imageHeight >= imageWidth;

    Log.log(`image metadata dimensions: W${imageWidth}x H${imageHeight} flipped: ${flipped}`);
    const screenIsWiderThanImg = imageHeight / imageWidth > screenHeight / screenWidth;
    const fitMode = screenIsPortrait
      ? imageIsPortrait && screenIsWiderThanImg
        ? sharp.fit.outside
        : sharp.fit.inside
      : !imageIsPortrait && !screenIsWiderThanImg
        ? sharp.fit.outside
        : sharp.fit.inside;

    Log.log(`rezise to: ${fitMode.toString()}`);

    const constraintSize = screenIsPortrait
      ? imageIsPortrait
        ? screenIsWiderThanImg
          ? screenWidth
          : screenHeight
        : screenHeight
      : !imageIsPortrait
        ? !screenIsWiderThanImg
          ? screenHeight
          : screenWidth
        : screenWidth;

    Log.log(`rezise size: ${constraintSize}`);
    const transformer = sharp()
      .rotate()
      .resize(constraintSize, constraintSize, {
        fit: fitMode,
      })
      .keepMetadata()
      .jpeg({quality: 80});

    const outputFilename = `${Date.now()}-${path.basename(imagePath)}`;
    const outputPath = path.join(this.cachePath, outputFilename);

    const writeStream = fs.createWriteStream(outputPath);
    fs.createReadStream(imagePath)
      .pipe(transformer)
      .pipe(writeStream);

    writeStream.on('finish', () => {
      Log.log(`Resizing done! Saved to ${outputPath}`);

      // Skapa URL:en som frontenden kan använda
      const imageUrl = `/${this.name}/cache/${outputFilename}`;
      Log.log(`Sending URL to frontend: ${imageUrl}`);

      // Skicka tillbaka URL:en istället för base64-data
      callback(imageUrl);
    });

    writeStream.on('error', (err) => {
      Log.error('Error writing resized image to file:', err);
    });

    // Hantera fel från sharp också
    transformer.on('error', (err) => {
      Log.error('Error resizing image with Sharp:', err);
    });
  },

  readFile (filepath, callback) {
    const ext = filepath.split('.').pop();

    if (this.config.resizeImages) {
      this.resizeImage(filepath, callback);
    } else {
      Log.log('resizeImages: false');
      const outputFilename = `${Date.now()}-${path.basename(filepath)}`;
      const outputPath = path.join(this.cachePath, outputFilename);

      fs.copyFile(filepath, outputPath, (err) => {
        if (err) {
          Log.error('Error copying file to cache:', err);
          return;
        }
        const imageUrl = `/${this.name}/cache/${outputFilename}`;
        callback(imageUrl);
      });
    }
  },

  getFiles (imagePath, imageList, excludedImagesList, config) {
    const contents = fs.readdirSync(imagePath);
    Log.info(`BACKGROUNDSLIDESHOW: Reading directory "${imagePath}" for images, found ${contents.length} files and directories`);
    for (let i = 0; i < contents.length; i++) {
      if (this.excludePaths.has(contents[i])) {
        continue;
      }
      const currentItem = `${imagePath}/${contents[i]}`;
      const stats = fs.lstatSync(currentItem);
      if (stats.isDirectory() && config.recursiveSubDirectories) {
        this.getFiles(currentItem, imageList, this.excludedFiles(currentItem), config);
      } else if (stats.isFile()) {
        const isValidImageFileExtension = this.checkValidImageFileExtension(currentItem);
        const isExcluded = this.isExcluded(contents[i], excludedImagesList);
        if (isValidImageFileExtension && !isExcluded) {
          imageList.push({
            path: currentItem,
            created: stats.ctimeMs,
            modified: stats.mtimeMs
          });
        }
      }
    }
  },

  // subclass socketNotificationReceived, received notification from module
  socketNotificationReceived (notification, payload) {
    if (notification === 'BACKGROUNDSLIDESHOW_REGISTER_CONFIG') {
      const config = payload;
      this.expressInstance.use(
        basePath + config.imagePaths[0],
        express.static(config.imagePaths[0], {maxAge: 3600000})
      );

      // Create set of excluded subdirectories.
      this.excludePaths = new Set(config.excludePaths);

      // Create set of valid image extensions.
      const validExtensionsList = config.validImageFileExtensions
        .toLowerCase()
        .split(',');
      this.validImageFileExtensions = new Set(validExtensionsList);

      // Get the image list in a non-blocking way since large # of images would cause
      // the MagicMirror startup banner to get stuck sometimes.
      this.config = config;
      setTimeout(() => {
        this.gatherImageList(config, true);
        this.getNextImage();
      }, 200);
    } else if (notification === 'BACKGROUNDSLIDESHOW_PLAY_VIDEO') {
      Log.info('mw got BACKGROUNDSLIDESHOW_PLAY_VIDEO');
      Log.info(`cmd line: omxplayer --win 0,0,1920,1080 --alpha 180 ${payload[0]}`);
      exec(
        `omxplayer --win 0,0,1920,1080 --alpha 180 ${payload[0]}`,
        (e, stdout, stderr) => {
          this.sendSocketNotification('BACKGROUNDSLIDESHOW_PLAY', null);
          Log.info('mw video done');
        }
      );
    } else if (notification === 'BACKGROUNDSLIDESHOW_NEXT_IMAGE') {
      Log.info('BACKGROUNDSLIDESHOW_NEXT_IMAGE');
      this.getNextImage();
    } else if (notification === 'BACKGROUNDSLIDESHOW_PREV_IMAGE') {
      Log.info('BACKGROUNDSLIDESHOW_PREV_IMAGE');
      this.getPrevImage();
    } else if (notification === 'BACKGROUNDSLIDESHOW_PAUSE') {
      Log.info('BACKGROUNDSLIDESHOW_PAUSE');
      this.stopTimer();
    } else if (notification === 'BACKGROUNDSLIDESHOW_PLAY') {
      Log.info('BACKGROUNDSLIDESHOW_PLAY');
      this.startOrRestartTimer();
    }
  }
});
