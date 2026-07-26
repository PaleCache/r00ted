#include <X11/Xlib.h>
#include <X11/extensions/shape.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    if (argc != 2) return 1;
    Window win = (Window) strtoul(argv[1], NULL, 0);

    Display *d = XOpenDisplay(NULL);
    if (!d) return 1;

    Region empty = XCreateRegion();
    XShapeCombineRegion(d, win, ShapeInput, 0, 0, empty, ShapeSet);
    XDestroyRegion(empty);
    XFlush(d);
    XCloseDisplay(d);
    return 0;
}
