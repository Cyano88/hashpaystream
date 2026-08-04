$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$assetRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'public\brand'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null

function New-TransparentBitmap([int]$width, [int]$height) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bitmap.SetResolution(144, 144)
  return $bitmap
}

function Set-HighQualityGraphics([System.Drawing.Graphics]$graphics) {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)
}

function Draw-GeometricMark(
  [System.Drawing.Graphics]$graphics,
  [float]$centerX,
  [float]$centerY,
  [float]$outerRadius,
  [float]$strokeWidth,
  [float]$innerRadius,
  [System.Drawing.Color]$color
) {
  $pen = [System.Drawing.Pen]::new($color, $strokeWidth)
  $pen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Center
  $brush = [System.Drawing.SolidBrush]::new($color)
  try {
    $graphics.DrawEllipse($pen, $centerX - $outerRadius, $centerY - $outerRadius, $outerRadius * 2, $outerRadius * 2)
    $graphics.FillEllipse($brush, $centerX - $innerRadius, $centerY - $innerRadius, $innerRadius * 2, $innerRadius * 2)
  } finally {
    $pen.Dispose()
    $brush.Dispose()
  }
}

$blue = [System.Drawing.ColorTranslator]::FromHtml('#3b82f6')

$mark = New-TransparentBitmap 512 512
$markGraphics = [System.Drawing.Graphics]::FromImage($mark)
try {
  Set-HighQualityGraphics $markGraphics
  Draw-GeometricMark $markGraphics 256 256 168 44 60 $blue
  $mark.Save((Join-Path $assetRoot 'hashpaystream-mark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $markGraphics.Dispose()
  $mark.Dispose()
}

$logo = New-TransparentBitmap 360 180
$logoGraphics = [System.Drawing.Graphics]::FromImage($logo)
try {
  Set-HighQualityGraphics $logoGraphics
  Draw-GeometricMark $logoGraphics 180 90 70 16 24 $blue
  $logo.Save((Join-Path $assetRoot 'hashpaystream-logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $logoGraphics.Dispose()
  $logo.Dispose()
}
