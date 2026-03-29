=== 资源文件说明 ===

1. AdbIME.apk
   ADB 输入法，用于通过 ADB 输入中文文字。
   首次设置时会自动安装到手机上。
   如果此文件不存在，请联系提供者获取。

2. platform-tools（可选）
   如果你的电脑没有安装 ADB，可以下载 Android SDK Platform Tools
   并将解压后的 platform-tools 文件夹放到本工具根目录：

   santiao-scheduler/
     platform-tools/
       adb (macOS/Linux) 或 adb.exe (Windows)
       ...其他文件...

   下载地址：
   macOS:   https://dl.google.com/android/repository/platform-tools-latest-darwin.zip
   Windows: https://dl.google.com/android/repository/platform-tools-latest-windows.zip
   Linux:   https://dl.google.com/android/repository/platform-tools-latest-linux.zip
