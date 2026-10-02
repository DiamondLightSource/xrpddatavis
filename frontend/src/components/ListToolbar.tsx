import { useState } from "react";
import {
  Button,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from "@mui/material";
import { MoreVertical, Search, Trash2, Upload, X } from "lucide-react";
import { ICON_SM, ICON_XS } from "../iconSizes";

interface ListToolbarProps {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  onUpload: () => void;
  onClearServer: () => void;
  canClearServer: boolean;
}

/** Search plus the list-level actions. Upload is the one routine action and
 * stays visible; the destructive "delete everything" lives behind the menu
 * so it never sits beside a safe action. */
export function ListToolbar({
  filterText,
  onFilterTextChange,
  onUpload,
  onClearServer,
  canClearServer,
}: ListToolbarProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        size="small"
        type="search"
        placeholder="Name, file or scan #"
        value={filterText}
        onChange={(e) => onFilterTextChange(e.target.value)}
        fullWidth
        slotProps={{
          htmlInput: { "aria-label": "Filter plots by name, file or scan number" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search {...ICON_XS} aria-hidden />
              </InputAdornment>
            ),
            endAdornment: filterText ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  edge="end"
                  aria-label="Clear search"
                  onClick={() => onFilterTextChange("")}
                >
                  <X {...ICON_XS} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<Upload {...ICON_SM} />}
        onClick={onUpload}
        sx={{ flexShrink: 0 }}
      >
        Upload
      </Button>
      <Tooltip title="More list actions">
        <IconButton
          aria-label="More list actions"
          aria-haspopup="menu"
          aria-expanded={anchor ? true : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <MoreVertical {...ICON_SM} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        <MenuItem
          disabled={!canClearServer}
          onClick={() => {
            close();
            onClearServer();
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <Trash2 {...ICON_SM} />
          </ListItemIcon>
          <ListItemText>Delete all plots…</ListItemText>
        </MenuItem>
      </Menu>
    </Stack>
  );
}
