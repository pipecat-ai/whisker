#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Frame definitions for Whisker.

This module defines special frames used by Whisker. These frames are used to
communicate with the Whisker client and are not meant to be part of the
application data.

"""

from dataclasses import dataclass
from typing import Any, Optional

from pipecat.frames.frames import DataFrame, SystemFrame


@dataclass
class WhiskerFrame(DataFrame):
    """Simple Whisker frame.

    This is a data frame for Whisker, it will be ordered with other data and
    control frames.

    """

    data: Optional[Any] = None


@dataclass
class WhiskerUrgentFrame(SystemFrame):
    """Urgent Whisker frame.

    This is a system frame for Whisker, it will be ordered with other system
    frames. As a system frame it has higher priority than other frames.

    """

    data: Optional[Any] = None
