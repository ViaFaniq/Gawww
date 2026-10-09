#!/usr/bin/env python3
import shutil
import subprocess
import sys

from PySide6.QtWidgets import (
    QApplication,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QLineEdit,
    QFileDialog,
    QComboBox,
    QSpinBox,
    QCheckBox,
    QMessageBox,
)


class AwwwGui(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("awww — Wallpaper Changer")
        self.setMinimumWidth(460)

        layout = QVBoxLayout(self)

        layout.addWidget(QLabel("Wallpaper image:"))
        file_row = QHBoxLayout()

        self.path = QLineEdit()
        self.path.setPlaceholderText("Choose an image file…")

        browse_button = QPushButton("Browse…")
        browse_button.clicked.connect(self.choose_file)

        file_row.addWidget(self.path)
        file_row.addWidget(browse_button)
        layout.addLayout(file_row)

        layout.addWidget(QLabel("Output (optional):"))
        self.output = QLineEdit()
        self.output.setPlaceholderText("e.g. DP-1")
        layout.addWidget(self.output)

        layout.addWidget(QLabel("Transition type:"))
        self.transition = QComboBox()
        self.transition.addItems(
            ["simple", "fade", "wipe", "grow", "center", "outer", "random", "none"]
        )
        layout.addWidget(self.transition)

        options = QHBoxLayout()

        options.addWidget(QLabel("Duration (ms):"))
        self.duration = QSpinBox()
        self.duration.setRange(0, 60000)
        self.duration.setValue(700)
        options.addWidget(self.duration)

        layout.addLayout(options)

        self.no_cache = QCheckBox("Disable cache (--no-cache)")
        layout.addWidget(self.no_cache)

        self.apply_button = QPushButton("Set Wallpaper")
        self.apply_button.clicked.connect(self.apply_wallpaper)
        layout.addWidget(self.apply_button)

        self.status = QLabel("")
        layout.addWidget(self.status)

    def choose_file(self):
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Choose an image",
            "",
            "Images (*.png *.jpg *.jpeg *.webp *.gif *.bmp *.avif);;All files (*)",
        )
        if path:
            self.path.setText(path)

    def apply_wallpaper(self):
        binary = shutil.which("awww")
        if not binary:
            QMessageBox.critical(
                self,
                "awww Not Found",
                "Could not find `awww` in PATH. Install awww and start its daemon.",
            )
            return

        image = self.path.text().strip()
        if not image:
            QMessageBox.warning(
                self, "No Image Selected", "Please choose a wallpaper image."
            )
            return

        command = [
            binary,
            "img",
            image,
            "--transition-type",
            self.transition.currentText(),
            "--transition-duration",
            str(self.duration.value() / 1000),
            "--transition-step",
            "90",
            "--transition-fps",
            "60",
        ]

        output = self.output.text().strip()
        if output:
            command += ["--outputs", output]

        if self.no_cache.isChecked():
            command.append("--no-cache")

        self.apply_button.setEnabled(False)
        self.status.setText("Setting wallpaper…")
        QApplication.processEvents()

        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=60,
            )

            if result.returncode == 0:
                self.status.setText("Wallpaper set successfully.")
            else:
                details = (
                    result.stderr or result.stdout or "No error details available."
                ).strip()
                QMessageBox.critical(self, "awww Error", details)
                self.status.setText("Failed to set wallpaper.")

        except subprocess.TimeoutExpired:
            QMessageBox.critical(
                self, "Timeout", "The awww command exceeded the time limit."
            )
            self.status.setText("Command timed out.")

        except OSError as exc:
            QMessageBox.critical(self, "Launch Error", str(exc))
            self.status.setText("Could not launch awww.")

        finally:
            self.apply_button.setEnabled(True)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AwwwGui()
    window.show()
    sys.exit(app.exec())
