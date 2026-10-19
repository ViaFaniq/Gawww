use std::{fs, io::Cursor, path::Path, path::PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{codecs::jpeg::JpegEncoder, ImageFormat, ImageReader};
use serde::Serialize;

const PREVIEW_WIDTH: u32 = 1400;
const PREVIEW_HEIGHT: u32 = 900;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
    pub preview: Option<String>,
    pub warning: Option<String>,
    pub available: bool,
}

pub fn inspect(path: &str) -> ImageInfo {
    let path_buf = PathBuf::from(path);
    let name = path_buf
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    let metadata = match fs::metadata(&path_buf) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => {
            return unavailable(path, name, "The selected path is not a file.");
        }
        Err(error) => {
            return unavailable(path, name, &format!("The file is unavailable: {error}"));
        }
    };

    let (width, height) = image::image_dimensions(&path_buf).unwrap_or((0, 0));
    let (preview, warning) = match make_preview(&path_buf) {
        Ok(preview) => (Some(preview), None),
        Err(error) => (None, Some(format!("Preview unavailable: {error}"))),
    };

    ImageInfo {
        path: path.to_string(),
        name,
        width,
        height,
        size_bytes: metadata.len(),
        preview,
        warning,
        available: true,
    }
}

fn unavailable(path: &str, name: String, warning: &str) -> ImageInfo {
    ImageInfo {
        path: path.to_string(),
        name,
        width: 0,
        height: 0,
        size_bytes: 0,
        preview: None,
        warning: Some(warning.to_string()),
        available: false,
    }
}

fn make_preview(path: &Path) -> Result<String, String> {
    let reader = ImageReader::open(path)
        .map_err(|error| error.to_string())?
        .with_guessed_format()
        .map_err(|error| error.to_string())?;
    let image = reader
        .decode()
        .map_err(|error| format!("unsupported or invalid image ({error})"))?;
    let thumbnail = image.thumbnail(PREVIEW_WIDTH, PREVIEW_HEIGHT);

    if thumbnail.color().has_alpha() {
        let mut buffer = Cursor::new(Vec::new());
        thumbnail
            .write_to(&mut buffer, ImageFormat::Png)
            .map_err(|error| error.to_string())?;
        let encoded = STANDARD.encode(buffer.into_inner());
        Ok(format!("data:image/png;base64,{encoded}"))
    } else {
        let mut buffer = Cursor::new(Vec::new());
        JpegEncoder::new_with_quality(&mut buffer, 88)
            .encode_image(&thumbnail.to_rgb8())
            .map_err(|error| error.to_string())?;
        let encoded = STANDARD.encode(buffer.into_inner());
        Ok(format!("data:image/jpeg;base64,{encoded}"))
    }
}
