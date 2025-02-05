#include <pebble.h>
#include "libs/pebble-assist.h"

// The maximum number of items in the array of thermostats
#define MAX_THERMOSTATS 2

// Data associated with a thermostat
struct thermostat {
  char name[50];
  char currentTemperature[6];
  char targetTemperature[6];
  char mode[10];
};

// Array that holds data for all thermostats
struct thermostat thermostats[MAX_THERMOSTATS] = {
  {"Loading ...", "0°", "0°", "OFF"},
  {"Loading ...", "0°", "0°", "OFF"}
};

typedef enum {
  TEMP_CHANGE,
  MODE_CHANGE,
  SUCCESS,
  FAILURE,
} Commands;


VibePattern short_vibe = { 
    .durations = (uint32_t []) {50},
    .num_segments = 1,};
VibePattern long_vibe = { 
    .durations = (uint32_t []) {40,40,40},
    .num_segments = 3,};
VibePattern overflow_vibe = { 
    .durations = (uint32_t []) {40,100,40},
    .num_segments = 3,};

#define SHORT_VIBE() if(!quiet_time_is_active()) { vibes_enqueue_custom_pattern(short_vibe); }
#define LONG_VIBE() if(!quiet_time_is_active()) { vibes_enqueue_custom_pattern(long_vibe); }
#define OVERFLOW_VIBE() if(!quiet_time_is_active()) { vibes_enqueue_custom_pattern(overflow_vibe); }


// The currently selected thermostat
static int selected_thermostat = 0;

static Window *s_window;
static GBitmap *s_res_up;
static GBitmap *s_res_selector;
static GBitmap *s_res_down;
static GBitmap *s_res_thermometer;
static GFont s_res_target_temperature_font;
static GFont s_res_current_temperature_font;
static GFont s_res_name_font;
static GFont s_res_mode_font;
static ActionBarLayer *action_bar_layer;
static BitmapLayer *bitmap_layer;
static TextLayer *current_temperature_layer;
static TextLayer *target_temperature_layer;
static TextLayer *name_layer;
static TextLayer *mode_layer;

// Updates the UI with current data from the array of thermostats
static void update_ui(void) {
  text_layer_set_text(current_temperature_layer, thermostats[selected_thermostat].currentTemperature);
  text_layer_set_text(target_temperature_layer, thermostats[selected_thermostat].targetTemperature);
  text_layer_set_text(name_layer, thermostats[selected_thermostat].name);
  text_layer_set_text(mode_layer, thermostats[selected_thermostat].mode);
}

static void handle_success() {
  window_set_background_color(s_window, GColorBlack);
  layer_mark_dirty(window_get_root_layer(s_window));
  SHORT_VIBE();
}

static void handle_failure() {
  window_set_background_color(s_window,GColorDarkGray);
  layer_mark_dirty(window_get_root_layer(s_window));
  LONG_VIBE();
}


// Process the message received in the watch from the phone
// Updates the array of thermostats with the received data
static void receive_message(DictionaryIterator *iter, void *context) {
  Tuple *command_tuple = dict_find(iter, MESSAGE_KEY_command);
  Tuple *thermostat_index_tuple = dict_find(iter, MESSAGE_KEY_thermostatIndex);
  Tuple *thermostat_name_tuple;
  Tuple *current_temperature_tuple;
  Tuple *target_temperature_tuple;
  Tuple *thermostat_mode_tuple;
  int i;

  if (thermostat_index_tuple) {
    i = thermostat_index_tuple->value->uint8;
    if (i < MAX_THERMOSTATS) { // Make sure the array does not overflow

      thermostat_name_tuple = dict_find(iter, MESSAGE_KEY_thermostatName);
      if (thermostat_name_tuple) {
        strcpy(thermostats[i].name, thermostat_name_tuple->value->cstring);
      }

      current_temperature_tuple = dict_find(iter, MESSAGE_KEY_currentTemperature);
      if (current_temperature_tuple) {
        strcpy(thermostats[i].currentTemperature, current_temperature_tuple->value->cstring);
      }

      target_temperature_tuple = dict_find(iter, MESSAGE_KEY_targetTemperature);
      if (target_temperature_tuple) {
        strcpy(thermostats[i].targetTemperature, target_temperature_tuple->value->cstring);
      }

      thermostat_mode_tuple = dict_find(iter, MESSAGE_KEY_thermostatMode);
      if (thermostat_mode_tuple) {
        strcpy(thermostats[i].mode, thermostat_mode_tuple->value->cstring);
      }
    }
    if (command_tuple) {
      switch (command_tuple->value->uint8) {
        case SUCCESS:
          handle_success();
          break;
        case FAILURE:
          handle_failure();
          break;
        default:
          break;
      }

    }
    update_ui();
  }
}

// Sends message from the watch to the phone
static void send_temperature_message(int temperature_change) {
  DictionaryIterator *iter;

  app_message_outbox_begin(&iter);

  if (iter == NULL) {
    return;
  }

  Tuplet command_tuple = TupletInteger(MESSAGE_KEY_command, TEMP_CHANGE);
  dict_write_tuplet(iter, &command_tuple);

  Tuplet thermostat_index_tuple =
    TupletInteger(MESSAGE_KEY_thermostatIndex, selected_thermostat);
  dict_write_tuplet(iter, &thermostat_index_tuple);

  Tuplet temperature_change_tuple =
    TupletInteger(MESSAGE_KEY_temperatureChange, temperature_change);
  dict_write_tuplet(iter, &temperature_change_tuple);

  dict_write_end(iter);

  app_message_outbox_send();
}

static void send_mode_message() {
  DictionaryIterator *iter;

  app_message_outbox_begin(&iter);

  if (iter == NULL) {
    return;
  }

  Tuplet command_tuple = TupletInteger(MESSAGE_KEY_command, MODE_CHANGE);
  dict_write_tuplet(iter, &command_tuple);

  Tuplet thermostat_index_tuple =
    TupletInteger(MESSAGE_KEY_thermostatIndex, selected_thermostat);
  dict_write_tuplet(iter, &thermostat_index_tuple);

  dict_write_end(iter);
  app_message_outbox_send();
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  // Toggles the supported modes of the thermostat and updates the UI
  send_mode_message();
}

static void select_long_click_handler(ClickRecognizerRef recognizer, void *context) {
  // Changes the selected thermostat and updates the UI.
  selected_thermostat = (selected_thermostat + 1) % MAX_THERMOSTATS;
  OVERFLOW_VIBE();
  update_ui();
}

static void up_click_handler(ClickRecognizerRef recognizer, void *context) {
  text_layer_set_text(name_layer, "Raising ...");
  send_temperature_message(1);
}

static void down_click_handler(ClickRecognizerRef recognizer, void *context) {
  text_layer_set_text(name_layer, "Lowering ...");
  send_temperature_message(-1);
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
  window_single_click_subscribe(BUTTON_ID_UP, up_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click_handler);
  window_long_click_subscribe(BUTTON_ID_SELECT, 500, select_long_click_handler, NULL);
}

static void initialize_ui(void) {
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_stack_push(s_window, false);
  
  s_res_up = gbitmap_create_with_resource(RESOURCE_ID_UP);
  s_res_selector = gbitmap_create_with_resource(RESOURCE_ID_SELECTOR);
  s_res_down = gbitmap_create_with_resource(RESOURCE_ID_DOWN);
  s_res_thermometer = gbitmap_create_with_resource(RESOURCE_ID_THERMOMETER);
  s_res_current_temperature_font = fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD);
  s_res_target_temperature_font = fonts_get_system_font(FONT_KEY_GOTHIC_24);
  s_res_name_font = fonts_get_system_font(FONT_KEY_GOTHIC_28);
  s_res_mode_font = fonts_get_system_font(FONT_KEY_GOTHIC_14);

  // action_bar_layer
  action_bar_layer = action_bar_layer_create();
  action_bar_layer_add_to_window(action_bar_layer, s_window);
  action_bar_layer_set_background_color(action_bar_layer, GColorWhite);
  action_bar_layer_set_icon(action_bar_layer, BUTTON_ID_UP, s_res_up);
  action_bar_layer_set_icon(action_bar_layer, BUTTON_ID_SELECT, s_res_selector);
  action_bar_layer_set_icon(action_bar_layer, BUTTON_ID_DOWN, s_res_down);
  action_bar_layer_set_click_config_provider(action_bar_layer, click_config_provider);
  layer_add_child(window_get_root_layer(s_window), (Layer *)action_bar_layer);
  

  int DISPLAY_WIDTH = PEBBLE_WIDTH - ACTION_BAR_WIDTH;


  // bitmap_layer
  bitmap_layer = bitmap_layer_create(GRect(0, 0, 41, 94));
  bitmap_layer_set_bitmap(bitmap_layer, s_res_thermometer);
  layer_add_child(window_get_root_layer(s_window), (Layer *)bitmap_layer);
  
  // current temperature_layer
  current_temperature_layer = text_layer_create(GRect(0, 15, DISPLAY_WIDTH-2, 45));
  text_layer_set_background_color(current_temperature_layer, GColorClear);
  text_layer_set_text_color(current_temperature_layer, GColorWhite);
  text_layer_set_text_alignment(current_temperature_layer, GTextAlignmentRight);
  text_layer_set_font(current_temperature_layer, s_res_current_temperature_font);
  layer_add_child(window_get_root_layer(s_window), (Layer *)current_temperature_layer);

  // target temperature_layer
  target_temperature_layer = text_layer_create(GRect(0, 60, DISPLAY_WIDTH-2, 45));
  text_layer_set_background_color(target_temperature_layer, GColorClear);
  text_layer_set_text_color(target_temperature_layer, GColorWhite);
  text_layer_set_text_alignment(target_temperature_layer, GTextAlignmentRight);
  text_layer_set_font(target_temperature_layer, s_res_target_temperature_font);
  layer_add_child(window_get_root_layer(s_window), (Layer *)target_temperature_layer);
  
  // name_layer
  name_layer = text_layer_create(GRect(2, PEBBLE_HEIGHT-60, DISPLAY_WIDTH-2, 60));
  text_layer_set_background_color(name_layer, GColorClear);
  text_layer_set_text_color(name_layer, GColorWhite);
  text_layer_set_font(name_layer, s_res_name_font);
  layer_add_child(window_get_root_layer(s_window), (Layer *)name_layer);

  // mode_layer
  mode_layer = text_layer_create(GRect(0, 0, DISPLAY_WIDTH-2, 20));
  text_layer_set_background_color(mode_layer, GColorClear);
  text_layer_set_text_color(mode_layer, GColorWhite);
  text_layer_set_text_alignment(mode_layer, GTextAlignmentRight);
  text_layer_set_font(mode_layer, s_res_mode_font);
  layer_add_child(window_get_root_layer(s_window), (Layer *)mode_layer);

  update_ui();
}

static void destroy_ui(void) {
  window_destroy(s_window);
  action_bar_layer_destroy(action_bar_layer);
  bitmap_layer_destroy(bitmap_layer);
  text_layer_destroy(current_temperature_layer);
  text_layer_destroy(target_temperature_layer);
  text_layer_destroy(name_layer);
  gbitmap_destroy(s_res_up);
  gbitmap_destroy(s_res_selector);
  gbitmap_destroy(s_res_down);
  gbitmap_destroy(s_res_thermometer);
}

static void handle_window_unload(Window* window) {
  destroy_ui();
}

static void show_main_window(void) {
  initialize_ui();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .unload = handle_window_unload,
  });
  window_stack_push(s_window, true);
}

static void initialize_messaging(void) {
  app_message_register_inbox_received(receive_message);

  const int inbound_size = 64;
  const int outbound_size = 64;
  app_message_open(inbound_size, outbound_size);
}

int main(void) {
  initialize_messaging();
  show_main_window();
  app_event_loop();
}
