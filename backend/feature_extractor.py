import numpy as np
from scipy import ndimage
from skimage import exposure
from skimage.filters import threshold_local
from skimage.measure import label, regionprops, moments
from skimage.feature import graycomatrix, graycoprops, hog

def rgbgrey(img):
    if len(img.shape) == 3:
        return np.average(img, axis=2)
    return img

def resize_with_padding(img, target_size=(100, 100)):
    if img.size == 0:
        return np.zeros(target_size)
    ratio = min(target_size[0]/img.shape[0], target_size[1]/img.shape[1])
    new_size = [int(img.shape[0]*ratio), int(img.shape[1]*ratio)]
    if ratio != 1.0:
        resized = ndimage.zoom(img, ratio, order=0)
    else:
        resized = img
    pad_y = target_size[0] - resized.shape[0]
    pad_x = target_size[1] - resized.shape[1]
    return np.pad(resized, ((0, pad_y), (0, pad_x)), mode='constant')

def preproc(img_array):
    """Preprocess a signature image (numpy array)"""
    try:
        img = exposure.equalize_adapthist(img_array, clip_limit=0.03)
        thresh = threshold_local(img, block_size=25, method='gaussian')
        binary = img > thresh
        binary = np.logical_not(binary)
        labeled = label(binary)
        regions = regionprops(labeled)
        if regions:
            min_area = 0.02 * binary.size
            valid_regions = [r for r in regions if r.area >= min_area]
            if valid_regions:
                largest = max(valid_regions, key=lambda x: x.area)
                minr, minc, maxr, maxc = largest.bbox
                cropped = binary[minr:maxr, minc:maxc]
                return resize_with_padding(cropped, (100, 100))
        return resize_with_padding(binary, (100, 100))
    except Exception:
        return np.zeros((100, 100))

def Centroid(img):
    white_pixels = np.argwhere(img)
    if len(white_pixels) == 0:
        return 0.5, 0.5
    centroid = np.mean(white_pixels, axis=0)
    normalized_centroid = centroid / np.array([img.shape[0], img.shape[1]])
    return normalized_centroid[0], normalized_centroid[1]

def EccentricitySolidity(img):
    labeled_img = label(img.astype("int8"))
    regions = regionprops(labeled_img)
    if not regions:
        return 0.0, 0.0
    largest_region = max(regions, key=lambda x: x.area)
    return largest_region.eccentricity, largest_region.solidity

def SkewKurtosis(img):
    h, w = img.shape
    if np.sum(img) == 0:
        return (0.0, 0.0), (0.0, 0.0)
    x = np.arange(w)
    y = np.arange(h)
    xp = np.sum(img, axis=0)
    yp = np.sum(img, axis=1)
    cx = np.sum(x * xp) / np.sum(xp) if np.sum(xp) > 0 else w/2
    cy = np.sum(y * yp) / np.sum(yp) if np.sum(yp) > 0 else h/2
    x2 = (x - cx) ** 2
    y2 = (y - cy) ** 2
    sx = np.sqrt(np.sum(x2 * xp) / np.sum(img)) if np.sum(img) > 0 else 1.0
    sy = np.sqrt(np.sum(y2 * yp) / np.sum(img)) if np.sum(img) > 0 else 1.0
    x3 = (x - cx) ** 3
    y3 = (y - cy) ** 3
    skewx = np.sum(xp * x3) / (np.sum(img) * sx ** 3) if sx > 0 else 0.0
    skewy = np.sum(yp * y3) / (np.sum(img) * sy ** 3) if sy > 0 else 0.0
    x4 = (x - cx) ** 4
    y4 = (y - cy) ** 4
    kurtx = np.sum(xp * x4) / (np.sum(img) * sx ** 4) - 3 if sx > 0 else 0.0
    kurty = np.sum(yp * y4) / (np.sum(img) * sy ** 4) - 3 if sy > 0 else 0.0
    return (skewx, skewy), (kurtx, kurty)

def getCSVFeatures(image_array):
    """Extract the 13 features from a preprocessed image (numpy array)"""
    try:
        img = preproc(image_array)
        binary_img = img > 0.5
        ratio = np.mean(binary_img)
        cent_y, cent_x = Centroid(binary_img)
        eccentricity, solidity = EccentricitySolidity(binary_img)
        (skew_x, skew_y), (kurt_x, kurt_y) = SkewKurtosis(binary_img)
        
        # GLCM features
        contrast = homogeneity = 0.0
        try:
            glcm = graycomatrix((img * 255).astype('uint8'),
                              distances=[5], angles=[0], symmetric=True, normed=True)
            contrast = graycoprops(glcm, 'contrast')[0, 0]
            homogeneity = graycoprops(glcm, 'homogeneity')[0, 0]
        except:
            pass
        
        # HOG
        hog_mean = 0.0
        try:
            fd, _ = hog(img, orientations=8, pixels_per_cell=(16, 16),
                       cells_per_block=(1, 1), visualize=True)
            hog_mean = np.mean(fd)
        except:
            pass
        
        # Zernike moment
        try:
            m = moments(img)
            zernike = m[0, 2] + m[2, 0]
        except:
            zernike = 0.0
        
        return (round(ratio, 4), round(cent_y, 4), round(cent_x, 4),
                round(eccentricity, 4), round(solidity, 4),
                round(contrast, 4), round(homogeneity, 4),
                round(skew_x, 4), round(skew_y, 4),
                round(kurt_x, 4), round(kurt_y, 4),
                round(hog_mean, 4), round(zernike, 4))
    except Exception:
        return (0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)